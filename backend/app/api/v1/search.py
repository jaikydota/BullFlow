from __future__ import annotations

import logging
import re
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.dependencies import get_current_user, get_db
from app.core.time import to_utc_iso
from app.models.audio import Audio
from app.models.document import Document
from app.models.image import Image as ImageModel
from app.models.video import Video
from app.models.user import User
from app.schemas.common import success
from app.services.minio_service import path_to_url

router = APIRouter(prefix="/search", tags=["统一查找"])

logger = logging.getLogger(__name__)


def _audio_snippet(transcript: str, query: str) -> str:
    """从转录文本中提取含关键词的上下文片段。"""
    idx = transcript.lower().find(query.lower())
    if idx < 0:
        return ""
    start = max(0, idx - 40)
    end = min(len(transcript), idx + len(query) + 80)
    return ("…" if start > 0 else "") + transcript[start:end] + ("…" if end < len(transcript) else "")


@router.post("/unified")
async def unified_search(
    body: dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """统一查找：文档混合检索 + 图片语义检索 + 视频标题匹配。
    
    音频转录文本通过文档混合检索命中（document.source_audio_id 非空），
    命中后自动归入音频列表，不再单独做音频全文检索。
    """
    query: str = body.get("query", "").strip()
    top_k: int = min(int(body.get("top_k", 10)), 50)

    if not query:
        return success(data={"documents": [], "images": [], "audios": [], "videos": []})

    logger.info("[统一查找] query=%r | top_k=%d | user=%s", query, top_k, current_user.id)

    results: dict[str, list] = {"documents": [], "images": [], "audios": [], "videos": []}

    # ── 1. 文档：混合检索 + 标题匹配补充，音频转录文档归入音频列表 ──
    try:
        from app.services import knowledge_service

        doc_hits = await knowledge_service.hybrid_search(
            query=query,
            user_id=current_user.id,
            db=db,
            top_k=top_k,
            use_reranker=True,
        )

        # 批量加载命中文档的 source_audio_id
        doc_ids = list({h["document_id"] for h in doc_hits})
        doc_rows = (await db.execute(
            select(Document.id, Document.source_audio_id).where(Document.id.in_(doc_ids))
        )).all()
        source_audio_map: dict[str, str | None] = {r.id: r.source_audio_id for r in doc_rows}

        # 收集需要回查的 audio_id（去重）
        audio_ids_to_fetch: list[str] = []
        seen_audio_ids: set[str] = set()
        audio_hit_scores: dict[str, tuple[float, list[str]]] = {}

        seen_doc_ids: set[str] = set()

        for h in doc_hits:
            audio_id = source_audio_map.get(h["document_id"])
            if audio_id:
                if audio_id not in seen_audio_ids:
                    seen_audio_ids.add(audio_id)
                    audio_ids_to_fetch.append(audio_id)
                    audio_hit_scores[audio_id] = (h["score"], h.get("highlight_content", []))
                else:
                    prev_score, _ = audio_hit_scores[audio_id]
                    if h["score"] > prev_score:
                        audio_hit_scores[audio_id] = (h["score"], h.get("highlight_content", []))
            else:
                seen_doc_ids.add(h["document_id"])
                results["documents"].append({
                    "id": h["document_id"],
                    "chunk_id": h["chunk_id"],
                    "title": h["document_title"],
                    "file_name": h.get("file_name", ""),
                    "file_type": h.get("file_type", ""),
                    "content": h.get("content", "")[:300],
                    "score": round(h["score"], 4),
                    "source": h["source"],
                    "highlight_content": h.get("highlight_content", []),
                })

        # ── 1b. 标题/文件名模糊匹配补充（去重已被混合检索命中的文档） ──
        title_doc_rows = (await db.execute(
            select(Document).where(
                Document.user_id == current_user.id,
                Document.status == "completed",
                Document.source_audio_id.is_(None),
                or_(
                    Document.title.ilike(f"%{query}%"),
                    Document.file_name.ilike(f"%{query}%"),
                ),
            )
            .order_by(Document.created_at.desc())
            .limit(top_k)
        )).scalars().all()

        title_match_count = 0
        for d in title_doc_rows:
            if d.id in seen_doc_ids:
                continue
            seen_doc_ids.add(d.id)
            title_match_count += 1
            results["documents"].append({
                "id": d.id,
                "chunk_id": "",
                "title": d.title or d.file_name or "",
                "file_name": d.file_name or "",
                "file_type": d.file_type or "",
                "content": "",
                "score": 0,
                "source": "title_match",
                "highlight_content": [],
            })

        # 批量加载音频详情
        if audio_ids_to_fetch:
            audio_rows = (await db.execute(
                select(Audio).where(Audio.id.in_(audio_ids_to_fetch))
            )).scalars().all()
            audio_map = {a.id: a for a in audio_rows}
            for audio_id in audio_ids_to_fetch:
                a = audio_map.get(audio_id)
                if not a:
                    continue
                score, highlights = audio_hit_scores[audio_id]
                snippet = ""
                if highlights:
                    snippet = re.sub(r"</?em>", "", highlights[0])[:200]
                elif a.transcript:
                    snippet = _audio_snippet(a.transcript, query)
                seen_audio_ids.add(a.id)
                results["audios"].append({
                    "id": a.id,
                    "title": a.title or a.file_name or "",
                    "url": path_to_url(a.file_path),
                    "snippet": snippet,
                    "transcript": (a.transcript or "")[:500],
                    "score": round(score, 4),
                    "created_at": to_utc_iso(a.created_at) or "",
                })

        logger.info(
            "[统一查找] 文档: 语义命中 %d + 标题补充 %d | 音频转录归入 %d",
            len(results["documents"]) - title_match_count,
            title_match_count,
            len(results["audios"]),
        )
    except Exception:
        logger.warning("[统一查找] 文档检索失败", exc_info=True)

    # ── 2. 图片：CLIP 语义检索 + 标题匹配补充 ──
    try:
        from app.services.clip_service import encode_text_for_image_search, search_image_embeddings

        seen_img_ids: set[str] = set()

        query_vec = await encode_text_for_image_search(query)
        img_hits = await search_image_embeddings(query_vec, current_user.id, top_k=top_k)
        if img_hits:
            img_ids = [h["id"] for h in img_hits]
            img_score_map = {h["id"]: h["score"] for h in img_hits}
            img_rows = (await db.execute(
                select(ImageModel).where(ImageModel.id.in_(img_ids), ImageModel.status == "completed")
            )).scalars().all()
            img_map = {r.id: r for r in img_rows}
            for img_id in img_ids:
                img = img_map.get(img_id)
                if not img:
                    continue
                seen_img_ids.add(img.id)
                results["images"].append({
                    "id": img.id,
                    "title": img.title or img.file_name or "",
                    "url": path_to_url(img.file_path),
                    "score": round(img_score_map[img_id], 4),
                    "created_at": to_utc_iso(img.created_at) or "",
                })

        # 标题/文件名补充
        title_img_rows = (await db.execute(
            select(ImageModel).where(
                ImageModel.user_id == current_user.id,
                ImageModel.status == "completed",
                or_(
                    ImageModel.title.ilike(f"%{query}%"),
                    ImageModel.file_name.ilike(f"%{query}%"),
                ),
            )
            .order_by(ImageModel.created_at.desc())
            .limit(top_k)
        )).scalars().all()

        img_title_count = 0
        for img in title_img_rows:
            if img.id in seen_img_ids:
                continue
            seen_img_ids.add(img.id)
            img_title_count += 1
            results["images"].append({
                "id": img.id,
                "title": img.title or img.file_name or "",
                "url": path_to_url(img.file_path),
                "score": 0,
                "created_at": to_utc_iso(img.created_at) or "",
            })

        logger.info("[统一查找] 图片: 语义命中 %d + 标题补充 %d", len(results["images"]) - img_title_count, img_title_count)
    except Exception:
        logger.warning("[统一查找] 图片检索失败", exc_info=True)

    # ── 3. 音频：标题/文件名匹配补充（转录命中已在步骤1归入） ──
    try:
        title_audio_rows = (await db.execute(
            select(Audio).where(
                Audio.user_id == current_user.id,
                Audio.status == "completed",
                or_(
                    Audio.title.ilike(f"%{query}%"),
                    Audio.file_name.ilike(f"%{query}%"),
                ),
            )
            .order_by(Audio.created_at.desc())
            .limit(top_k)
        )).scalars().all()

        audio_title_count = 0
        for a in title_audio_rows:
            if a.id in seen_audio_ids:
                continue
            seen_audio_ids.add(a.id)
            audio_title_count += 1
            snippet = ""
            if a.transcript:
                snippet = _audio_snippet(a.transcript, query) or (a.transcript[:200])
            results["audios"].append({
                "id": a.id,
                "title": a.title or a.file_name or "",
                "url": path_to_url(a.file_path),
                "snippet": snippet,
                "transcript": (a.transcript or "")[:500],
                "score": 0,
                "created_at": to_utc_iso(a.created_at) or "",
            })
        logger.info("[统一查找] 音频: 转录命中 %d + 标题补充 %d", len(results["audios"]) - audio_title_count, audio_title_count)
    except Exception:
        logger.warning("[统一查找] 音频检索失败", exc_info=True)

    # ── 4. 视频：标题/文件名包含关键词 ──
    try:
        video_rows = (await db.execute(
            select(Video)
            .where(
                Video.user_id == current_user.id,
                or_(
                    Video.title.ilike(f"%{query}%"),
                    Video.file_name.ilike(f"%{query}%"),
                ),
            )
            .order_by(Video.created_at.desc())
            .limit(top_k)
        )).scalars().all()
        for v in video_rows:
            results["videos"].append({
                "id": v.id,
                "title": v.title or v.file_name or "",
                "url": path_to_url(v.file_path),
                "cover_url": path_to_url(v.cover_path) if v.cover_path else None,
                "created_at": to_utc_iso(v.created_at) or "",
            })
        logger.info("[统一查找] 视频命中 %d 条", len(results["videos"]))
    except Exception:
        logger.warning("[统一查找] 视频检索失败", exc_info=True)

    total = sum(len(v) for v in results.values())
    logger.info("[统一查找] 完成 | 总计 %d 条结果", total)
    return success(data={**results, "total": total})
