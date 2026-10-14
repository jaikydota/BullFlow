from __future__ import annotations

import logging
from datetime import datetime

from app.core.time import to_utc_iso, utcnow

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.elasticsearch import KNOWLEDGE_INDEX, get_elasticsearch
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.services.minio_service import MinIOService
from app.utils.file_parser import HeadingInfo, parse_file
from app.utils.text_splitter import split_table_text, split_text

logger = logging.getLogger(__name__)


def _build_heading_context(
    chunk_start: int,
    chunk_end: int,
    headings: list[HeadingInfo],
) -> str:
    """根据 chunk 在原文中的位置，构建其所属标题链路。

    例如: "产品手册 > 安装指南 > 系统要求"
    """
    if not headings:
        return ""

    # Find all headings that appear before this chunk's start position
    active_headings: dict[int, str] = {}
    for h in headings:
        if h.start_pos <= chunk_start:
            active_headings[h.level] = h.title
            # Clear lower-level headings when a higher-level one appears
            for lvl in list(active_headings.keys()):
                if lvl > h.level:
                    del active_headings[lvl]

    if not active_headings:
        return ""

    parts = [active_headings[lvl] for lvl in sorted(active_headings.keys())]
    return " > ".join(parts)


def _assign_heading_contexts(
    chunks_text: list[str],
    full_text: str,
    headings: list[HeadingInfo],
) -> list[str]:
    """为每个 chunk 分配上下文标题链路。"""
    if not headings:
        return [""] * len(chunks_text)

    contexts: list[str] = []
    search_start = 0
    for chunk in chunks_text:
        pos = full_text.find(chunk[:80], search_start)
        if pos == -1:
            pos = search_start
        chunk_end = pos + len(chunk)
        ctx = _build_heading_context(pos, chunk_end, headings)
        contexts.append(ctx)
        search_start = max(search_start, pos)

    return contexts


async def process_document(document_id: str, db: AsyncSession) -> None:
    """文档处理管线：解析文件 → 标题提取 → 文本分块 → 上下文注入 → 向量化 → 三路存储。"""
    import asyncio

    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        logger.error("Document %s not found", document_id)
        return

    doc.status = "processing"
    await db.flush()
    # 立即提交 status=processing，释放行锁，让并发列表查询不被阻塞
    await db.commit()

    try:
        # ── 第 0 步：清理旧分块数据（重处理场景） ──
        old_chunks_result = await db.execute(
            select(DocumentChunk).where(DocumentChunk.document_id == document_id)
        )
        old_chunks = list(old_chunks_result.scalars().all())

        if old_chunks:
            old_milvus_ids = [c.milvus_id for c in old_chunks if c.milvus_id]
            if old_milvus_ids:
                from app.services.embedding_service import delete_text_embeddings

                await delete_text_embeddings(old_milvus_ids)

            old_es_ids = [c.es_id for c in old_chunks if c.es_id]
            if old_es_ids:
                es = get_elasticsearch()
                for es_id in old_es_ids:
                    try:
                        await es.delete(index=KNOWLEDGE_INDEX, id=es_id)
                    except Exception:
                        pass

            for chunk in old_chunks:
                await db.delete(chunk)
            await db.flush()
            await db.commit()
            logger.info("文档 %s 清理旧分块 %d 个", document_id, len(old_chunks))

        # ── 第 1 步：从 MinIO 下载原始文件（线程池，避免阻塞事件循环） ──
        minio_svc = MinIOService()
        _bucket = settings.MINIO_BUCKET_NAME
        _path = doc.file_path
        _client = minio_svc.client

        def _sync_download() -> bytes:
            resp = _client.get_object(_bucket, _path)
            try:
                return resp.read()
            finally:
                resp.close()
                resp.release_conn()

        file_bytes = await asyncio.to_thread(_sync_download)

        # ── 第 2 步：解析文件（返回 ParseResult，含文本 + 标题层级） ──
        parse_result = await parse_file(file_bytes, doc.file_type)
        text = parse_result.text
        headings = parse_result.headings

        logger.info(
            "文档 %s 解析完成: 文件类型=%s, 文件大小=%s bytes, 提取文本=%d 字符, 标题=%d 个",
            document_id,
            doc.file_type,
            len(file_bytes),
            len(text),
            len(headings),
        )
        if not text.strip():
            # 文件保留在 MinIO + documents 表，仅供下载，不建索引
            doc.status = "completed"
            doc.chunk_count = 0
            doc.error_message = (
                "未能从文件中提取到可检索的文字内容（文件可能以图片/音频/视频为主），"
                "文件已保留供下载，但不会出现在知识库检索结果中。"
                "如需检索，请启用 OCR 服务或上传含文字内容的格式。"
            )
            await db.flush()
            logger.warning(
                "文档 %s 提取文本为空，已保留文件但跳过索引建立 [文件类型=%s]",
                document_id, doc.file_type,
            )
            return

        # 成功提取文本，清除可能残留的提示信息
        doc.error_message = None

        # ── 第 3 步：文本分块（线程池，wtpsplit/DP 为 CPU 密集型，不可阻塞事件循环） ──
        _TABLE_TYPES = {"csv", "xlsx", "xls"}
        if doc.file_type in _TABLE_TYPES:
            chunks_text = await asyncio.to_thread(split_table_text, text)
        else:
            chunks_text = await asyncio.to_thread(split_text, text)
        if not chunks_text:
            doc.status = "completed"
            doc.chunk_count = 0
            doc.error_message = "文本分块结果为空，文件已保留供下载。"
            await db.flush()
            return

        # ── 第 3.5 步：上下文标题注入（Late Chunking） ──
        heading_contexts = _assign_heading_contexts(chunks_text, text, headings)

        # ── 第 4 步：向量化（BGE-M3 Embedding） ──
        # Embedding 时拼接 heading_context + content，提升语义表达
        from app.services.embedding_service import encode_texts, insert_text_embeddings

        texts_for_embedding = []
        for ctx, chunk in zip(heading_contexts, chunks_text):
            if ctx:
                texts_for_embedding.append(f"{ctx}\n{chunk}")
            else:
                texts_for_embedding.append(chunk)

        embeddings = await encode_texts(texts_for_embedding)

        # ── 第 5 步：三路存储 ──
        chunk_objs: list[DocumentChunk] = []
        chunk_ids: list[str] = []
        user_ids: list[str] = []
        doc_ids: list[str] = []

        for idx, (chunk_text, heading_ctx) in enumerate(
            zip(chunks_text, heading_contexts)
        ):
            chunk = DocumentChunk(
                user_id=doc.user_id,
                document_id=doc.id,
                chunk_index=idx,
                content=chunk_text,
                heading_context=heading_ctx or None,
                token_count=len(chunk_text),
            )
            db.add(chunk)
            await db.flush()

            chunk.milvus_id = chunk.id
            chunk_objs.append(chunk)
            chunk_ids.append(chunk.id)
            user_ids.append(doc.user_id)
            doc_ids.append(doc.id)

        # 5b. Milvus
        await insert_text_embeddings(chunk_ids, user_ids, doc_ids, embeddings)

        # 5c. Elasticsearch
        es = get_elasticsearch()
        es_actions: list[dict] = []
        for chunk in chunk_objs:
            es_actions.append({"index": {"_index": KNOWLEDGE_INDEX, "_id": chunk.id}})
            es_actions.append(
                {
                    "chunk_id": chunk.id,
                    "user_id": doc.user_id,
                    "document_id": doc.id,
                    "content": chunk.content,
                    "heading_context": chunk.heading_context or "",
                    "title": doc.title,
                    "category": doc.category,
                    "tags": doc.tags or [],
                    "chunk_index": chunk.chunk_index,
                    "token_count": chunk.token_count,
                    "created_at": to_utc_iso(utcnow()),
                }
            )

        if es_actions:
            resp = await es.bulk(operations=es_actions, refresh="wait_for")
            if resp.get("errors"):
                failed = [
                    item
                    for item in resp["items"]
                    if item.get("index", {}).get("error")
                ]
                logger.warning("ES 批量索引出现 %d 个错误", len(failed))
            for item, chunk in zip(resp["items"], chunk_objs):
                chunk.es_id = item.get("index", {}).get("_id", chunk.id)

        doc.status = "completed"
        doc.chunk_count = len(chunk_objs)
        await db.flush()
        logger.info("文档 %s 处理完成：%d 个分块", document_id, len(chunk_objs))

    except Exception as e:
        logger.exception("文档 %s 处理失败", document_id)
        doc.status = "failed"
        doc.error_message = str(e)[:2000]
        await db.flush()
        await db.commit()
