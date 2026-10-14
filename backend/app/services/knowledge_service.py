from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.elasticsearch import KNOWLEDGE_INDEX, get_elasticsearch
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.services.embedding_service import encode_texts, search_text_embeddings

logger = logging.getLogger(__name__)


async def hybrid_search(
    query: str,
    user_id: str,
    db: AsyncSession,
    *,
    top_k: int = 10,
    document_ids: list[str] | None = None,
    category: str | None = None,
    use_reranker: bool = True,
) -> list[dict[str, Any]]:
    """混合检索: 向量召回 + 全文召回 → 加权合并去重 → 可选重排序。"""
    expand_k = top_k * 3
    reranker_active = use_reranker and settings.RERANKER_ENABLED
    logger.info(
        "[混合检索] query=%r | top_k=%d | expand_k=%d | doc_filter=%s | category=%s"
        " | reranker=%s (use_reranker=%s, RERANKER_ENABLED=%s)"
        " | merge_mode=%s | vector_threshold=%.2f | reranker_threshold=%.3f",
        query, top_k, expand_k,
        document_ids or "全部",
        category or "全部",
        reranker_active, use_reranker, settings.RERANKER_ENABLED,
        settings.HYBRID_MERGE_MODE,
        settings.VECTOR_SCORE_THRESHOLD,
        settings.RERANKER_SCORE_THRESHOLD,
    )

    vectors = await encode_texts([query])
    query_vector = vectors[0]

    # Apply Query Adapter if enabled
    if settings.QUERY_ADAPTER_ENABLED:
        from app.services.query_adapter_service import apply_adapter

        query_vector = apply_adapter(query_vector)

    vector_hits, text_hits = await _parallel_recall(
        query, query_vector, user_id, expand_k, document_ids, category
    )

    logger.info(
        "[混合检索] 双路召回完成 | 向量命中=%d | 全文命中=%d",
        len(vector_hits), len(text_hits),
    )
    if vector_hits:
        top3_vec = [(h.get("id") or h.get("chunk_id", ""), round(h["score"], 4)) for h in vector_hits[:3]]
        logger.info("[混合检索] 向量 Top3 (chunk_id, 原始分): %s", top3_vec)
    if text_hits:
        top3_txt = [(h.get("chunk_id", ""), round(h["score"], 4)) for h in text_hits[:3]]
        logger.info("[混合检索] 全文 Top3 (chunk_id, 原始分): %s", top3_txt)

    # 向量绝对分数阈值过滤：去除明显不相关的向量结果，减少重排候选量
    if settings.VECTOR_SCORE_THRESHOLD > 0 and vector_hits:
        before = len(vector_hits)
        vector_hits = [h for h in vector_hits if h["score"] >= settings.VECTOR_SCORE_THRESHOLD]
        logger.info(
            "[混合检索] 向量阈值过滤(≥%.2f): %d → %d 条",
            settings.VECTOR_SCORE_THRESHOLD, before, len(vector_hits),
        )

    merged = _merge_results(vector_hits, text_hits)

    if not merged:
        logger.info("[混合检索] 合并后无结果，返回空列表")
        return []

    source_counts = {"vector": 0, "fulltext": 0, "hybrid": 0}
    for h in merged:
        s = h["source"]
        if s in source_counts:
            source_counts[s] += 1
    logger.info(
        "[混合检索] %s 合并后共 %d 条 | vector-only=%d | fulltext-only=%d | hybrid(双路)=%d"
        " | 评分范围 [%.4f, %.4f]",
        settings.HYBRID_MERGE_MODE.upper(),
        len(merged),
        source_counts["vector"], source_counts["fulltext"], source_counts["hybrid"],
        merged[-1]["score"], merged[0]["score"],
    )

    chunk_ids = [h["chunk_id"] for h in merged]
    chunks_map = await _load_chunks(chunk_ids, db)
    docs_map = await _load_documents(
        list({c.document_id for c in chunks_map.values()}), db
    )

    enriched = []
    for hit in merged:
        chunk = chunks_map.get(hit["chunk_id"])
        if not chunk:
            continue
        doc = docs_map.get(chunk.document_id)
        item: dict[str, Any] = {
            "chunk_id": hit["chunk_id"],
            "document_id": chunk.document_id,
            "document_title": doc.title if doc else "",
            "file_name": doc.file_name if doc else "",
            "file_type": doc.file_type if doc else "",
            "content": chunk.content,
            "heading_context": chunk.heading_context or "",
            "score": hit["score"],
            "source": hit["source"],
            "metadata": chunk.metadata_ or {},
        }
        if hit.get("highlight_content"):
            item["highlight_content"] = hit["highlight_content"]
        if hit.get("highlight_title"):
            item["highlight_title"] = hit["highlight_title"]
        enriched.append(item)

    if reranker_active and len(enriched) > 1:
        try:
            from app.services.reranker_service import rerank

            reranker_top_n = settings.RERANKER_TOP_N
            if reranker_top_n > 0 and len(enriched) > reranker_top_n:
                logger.info(
                    "[混合检索] 重排序候选截断: %d → %d (RERANKER_TOP_N)",
                    len(enriched), reranker_top_n,
                )
                enriched = enriched[:reranker_top_n]

            logger.info("[混合检索] 启动重排序，候选数=%d → 目标 top_k=%d", len(enriched), top_k)
            passages = [e["content"] for e in enriched]
            ranked = await rerank(query, passages, top_k=top_k)
            reranked = []
            for r in ranked:
                item = enriched[r["index"]]
                item["score"] = r["score"]
                item["source"] = "reranker"
                reranked.append(item)
            enriched = reranked
            logger.info(
                "[混合检索] 重排序完成 | 返回 %d 条 | 分数范围 [%.4f, %.4f]",
                len(enriched),
                enriched[-1]["score"] if enriched else 0,
                enriched[0]["score"] if enriched else 0,
            )
            if settings.RERANKER_SCORE_THRESHOLD > 0 and enriched:
                before = len(enriched)
                enriched = [e for e in enriched if e["score"] >= settings.RERANKER_SCORE_THRESHOLD]
                logger.info(
                    "[混合检索] 重排序阈值过滤(≥%.3f): %d → %d 条",
                    settings.RERANKER_SCORE_THRESHOLD, before, len(enriched),
                )
        except Exception:
            logger.warning(
                "Reranker failed, falling back to weighted merge", exc_info=True
            )
            enriched = enriched[:top_k]
    else:
        if not reranker_active:
            logger.info("[混合检索] 重排序未启用，直接截取 top_k=%d", top_k)
        enriched = enriched[:top_k]

    logger.info(
        "[混合检索] 最终返回 %d 条 | Top3: %s",
        len(enriched),
        [(r["source"], round(r["score"], 4), r["document_title"][:20]) for r in enriched[:3]],
    )

    # Expand each chunk with its neighbors for richer context (chunk span)
    enriched = await _expand_with_neighbors(enriched, db)

    return enriched


async def vector_search(
    query: str,
    user_id: str,
    db: AsyncSession,
    *,
    top_k: int = 10,
    document_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Pure vector search."""
    logger.info(
        "[向量检索] query=%r | top_k=%d | doc_filter=%s",
        query, top_k, document_ids or "全部",
    )
    vectors = await encode_texts([query])
    query_vector = vectors[0]

    if settings.QUERY_ADAPTER_ENABLED:
        from app.services.query_adapter_service import apply_adapter

        query_vector = apply_adapter(query_vector)

    hits = await search_text_embeddings(
        query_vector, user_id, top_k=top_k, document_ids=document_ids
    )
    logger.info(
        "[向量检索] 命中 %d 条 | 评分范围 [%.4f, %.4f]",
        len(hits),
        hits[-1]["score"] if hits else 0,
        hits[0]["score"] if hits else 0,
    )
    if settings.VECTOR_SCORE_THRESHOLD > 0 and hits:
        before = len(hits)
        hits = [h for h in hits if h["score"] >= settings.VECTOR_SCORE_THRESHOLD]
        logger.info(
            "[向量检索] 阈值过滤(≥%.2f): %d → %d 条",
            settings.VECTOR_SCORE_THRESHOLD, before, len(hits),
        )
    results = await _enrich_hits(hits, db)
    logger.info("[向量检索] 返回 %d 条", len(results))
    return results


async def fulltext_search(
    query: str,
    user_id: str,
    db: AsyncSession,
    *,
    top_k: int = 10,
    document_ids: list[str] | None = None,
    category: str | None = None,
) -> list[dict[str, Any]]:
    """Pure full-text search via Elasticsearch with highlight."""
    logger.info(
        "[全文检索] query=%r | top_k=%d | doc_filter=%s | category=%s",
        query, top_k, document_ids or "全部", category or "全部",
    )
    hits = await _es_search(
        query,
        user_id,
        top_k,
        document_ids,
        category,
        return_highlights=True,
    )
    logger.info(
        "[全文检索] ES 命中 %d 条 | 评分范围 [%.4f, %.4f]",
        len(hits),
        hits[-1]["score"] if hits else 0,
        hits[0]["score"] if hits else 0,
    )
    results = await _enrich_hits(hits, db)
    logger.info("[全文检索] 返回 %d 条", len(results))
    return results


async def image_search(
    query: str,
    user_id: str,
    db: AsyncSession,
    *,
    top_k: int = 20,
) -> list[dict[str, Any]]:
    """Image semantic search via CLIP."""
    from app.services.clip_service import (
        encode_text_for_image_search,
        search_image_embeddings,
    )

    logger.info("[图片检索] query=%r | top_k=%d", query, top_k)
    query_vec = await encode_text_for_image_search(query)
    hits = await search_image_embeddings(query_vec, user_id, top_k=top_k)
    return [{"image_id": h["id"], "score": h["score"]} for h in hits]


# ---- internal helpers ----


async def _parallel_recall(
    query: str,
    query_vector: list[float],
    user_id: str,
    expand_k: int,
    document_ids: list[str] | None,
    category: str | None,
) -> tuple[list[dict], list[dict]]:
    import asyncio

    vec_task = asyncio.create_task(
        search_text_embeddings(
            query_vector, user_id, top_k=expand_k, document_ids=document_ids
        )
    )
    es_task = asyncio.create_task(
        _es_search(
            query, user_id, expand_k, document_ids, category, return_highlights=True
        )
    )
    vector_hits, text_hits = await asyncio.gather(vec_task, es_task)
    return vector_hits, text_hits


async def _es_search(
    query: str,
    user_id: str,
    top_k: int,
    document_ids: list[str] | None = None,
    category: str | None = None,
    *,
    return_highlights: bool = False,
) -> list[dict]:
    es = get_elasticsearch()

    must = [
        {
            "multi_match": {
                "query": query,
                "fields": [
                    "content^1.0",
                    "heading_context^1.3",
                    "title^1.5",
                    "tags^1.2",
                ],
                "type": "best_fields",
                "analyzer": "ik_search_analyzer",
                "minimum_should_match": "50%",
            }
        }
    ]
    filter_clauses: list[dict] = [{"term": {"user_id": user_id}}]
    if document_ids:
        filter_clauses.append({"terms": {"document_id": document_ids}})
    if category:
        filter_clauses.append({"term": {"category": category}})

    resp = await es.search(
        index=KNOWLEDGE_INDEX,
        query={
            "bool": {
                "must": must,
                "filter": filter_clauses,
            }
        },
        size=top_k,
        highlight={
            "pre_tags": ["<em>"],
            "post_tags": ["</em>"],
            "fields": {
                "content": {"fragment_size": 200, "number_of_fragments": 3},
                "title": {"fragment_size": 100, "number_of_fragments": 1},
            },
        },
    )
    hits = []
    for h in resp["hits"]["hits"]:
        src = h["_source"]
        hit: dict[str, Any] = {
            "chunk_id": src.get("chunk_id", h["_id"]),
            "document_id": src.get("document_id", ""),
            "score": h["_score"],
            "source": "fulltext",
        }
        if return_highlights and "highlight" in h:
            hl = h["highlight"]
            hit["highlight_content"] = hl.get("content", [])
            hit["highlight_title"] = hl.get("title", [])
        hits.append(hit)
    return hits


def _merge_results(vector_hits: list[dict], text_hits: list[dict]) -> list[dict]:
    """根据 HYBRID_MERGE_MODE 选择合并策略."""
    if settings.HYBRID_MERGE_MODE == "rrf":
        return _rrf_merge(vector_hits, text_hits)
    return _weighted_merge(vector_hits, text_hits)


def _rrf_merge(vector_hits: list[dict], text_hits: list[dict]) -> list[dict]:
    """RRF（倒数排名融合）合并。

    评分公式: score = Σ 1/(k + rank + 1)
    只看排名不看原始分值，避免向量归一化相对分虚高的问题。
    双路同时命中时分数相加 (source=hybrid)。
    """
    k = settings.RRF_K
    seen: dict[str, dict] = {}

    for rank, h in enumerate(vector_hits):
        cid = h["id"] if "id" in h else h.get("chunk_id", "")
        seen[cid] = {"chunk_id": cid, "score": 1.0 / (k + rank + 1), "source": "vector"}

    for rank, h in enumerate(text_hits):
        cid = h.get("chunk_id", "")
        rrf_score = 1.0 / (k + rank + 1)
        if cid in seen:
            seen[cid]["score"] += rrf_score
            seen[cid]["source"] = "hybrid"
        else:
            seen[cid] = {"chunk_id": cid, "score": rrf_score, "source": "fulltext"}
        if h.get("highlight_content"):
            seen[cid]["highlight_content"] = h["highlight_content"]
        if h.get("highlight_title"):
            seen[cid]["highlight_title"] = h["highlight_title"]

    return sorted(seen.values(), key=lambda x: x["score"], reverse=True)


def _weighted_merge(vector_hits: list[dict], text_hits: list[dict]) -> list[dict]:
    """归一化加权合并（原始方案，保留作备选）。

    评分公式:
      向量归一化分 = (原始向量分 / 向量最高分) × HYBRID_VECTOR_WEIGHT
      全文归一化分 = (ES原始分   / ES最高分)   × HYBRID_FULLTEXT_WEIGHT
      双路命中时两者相加 (source=hybrid，最高 = vector_weight + fulltext_weight)
    """
    vw = settings.HYBRID_VECTOR_WEIGHT
    fw = settings.HYBRID_FULLTEXT_WEIGHT
    seen: dict[str, dict] = {}

    if vector_hits:
        max_v = max(h["score"] for h in vector_hits) or 1.0
        for h in vector_hits:
            cid = h["id"] if "id" in h else h.get("chunk_id", "")
            norm_score = (h["score"] / max_v) * vw
            seen[cid] = {"chunk_id": cid, "score": norm_score, "source": "vector"}

    if text_hits:
        max_t = max(h["score"] for h in text_hits) or 1.0
        for h in text_hits:
            cid = h.get("chunk_id", "")
            norm_score = (h["score"] / max_t) * fw
            if cid in seen:
                seen[cid]["score"] += norm_score
                seen[cid]["source"] = "hybrid"
            else:
                seen[cid] = {"chunk_id": cid, "score": norm_score, "source": "fulltext"}
            if h.get("highlight_content"):
                seen[cid]["highlight_content"] = h["highlight_content"]
            if h.get("highlight_title"):
                seen[cid]["highlight_title"] = h["highlight_title"]

    return sorted(seen.values(), key=lambda x: x["score"], reverse=True)


async def _expand_with_neighbors(
    results: list[dict[str, Any]], db: AsyncSession, *, neighbors: tuple[int, ...] = (-1, 1)
) -> list[dict[str, Any]]:
    """Expand each result chunk with its adjacent neighbors' content for richer context.

    Inspired by RAGLite's retrieve_chunk_spans: extends each retrieved chunk with
    its previous and next chunk to form a contiguous span, improving RAG context quality.
    """
    if not results or not neighbors:
        return results

    # Collect (document_id, chunk_index + offset) for all neighbor lookups
    neighbor_conditions = []
    for r in results:
        chunk = await db.execute(
            select(DocumentChunk).where(DocumentChunk.id == r["chunk_id"])
        )
        chunk_obj = chunk.scalar_one_or_none()
        if chunk_obj is None:
            continue
        r["_chunk_index"] = chunk_obj.chunk_index
        r["_document_id"] = chunk_obj.document_id
        for offset in neighbors:
            neighbor_conditions.append(
                (chunk_obj.document_id, chunk_obj.chunk_index + offset)
            )

    if not neighbor_conditions:
        return results

    # Batch load all neighbor chunks
    from sqlalchemy import and_, or_

    neighbor_result = await db.execute(
        select(DocumentChunk).where(
            or_(
                *[
                    and_(
                        DocumentChunk.document_id == doc_id,
                        DocumentChunk.chunk_index == idx,
                    )
                    for doc_id, idx in neighbor_conditions
                ]
            )
        )
    )
    neighbor_map: dict[tuple[str, int], DocumentChunk] = {}
    for nc in neighbor_result.scalars().all():
        neighbor_map[(nc.document_id, nc.chunk_index)] = nc

    # Build expanded content for each result
    for r in results:
        if "_chunk_index" not in r:
            continue
        doc_id = r["_document_id"]
        idx = r["_chunk_index"]

        prev_chunk = neighbor_map.get((doc_id, idx - 1))
        next_chunk = neighbor_map.get((doc_id, idx + 1))

        context_parts = []
        if prev_chunk:
            context_parts.append(prev_chunk.content)
        context_parts.append(r["content"])
        if next_chunk:
            context_parts.append(next_chunk.content)

        r["content_expanded"] = "\n\n".join(context_parts)
        # Clean up internal keys
        r.pop("_chunk_index", None)
        r.pop("_document_id", None)

    return results


async def _load_chunks(
    chunk_ids: list[str], db: AsyncSession
) -> dict[str, DocumentChunk]:
    if not chunk_ids:
        return {}
    result = await db.execute(
        select(DocumentChunk).where(DocumentChunk.id.in_(chunk_ids))
    )
    return {c.id: c for c in result.scalars().all()}


async def _load_documents(
    doc_ids: list[str], db: AsyncSession
) -> dict[str, Document]:
    if not doc_ids:
        return {}
    result = await db.execute(select(Document).where(Document.id.in_(doc_ids)))
    return {d.id: d for d in result.scalars().all()}


async def _enrich_hits(
    hits: list[dict], db: AsyncSession
) -> list[dict[str, Any]]:
    chunk_ids = [h.get("id") or h.get("chunk_id") for h in hits]
    chunks_map = await _load_chunks(chunk_ids, db)
    doc_ids = list({c.document_id for c in chunks_map.values()})
    docs_map = await _load_documents(doc_ids, db)

    results = []
    for h in hits:
        cid = h.get("id") or h.get("chunk_id")
        chunk = chunks_map.get(cid)
        if not chunk:
            continue
        doc = docs_map.get(chunk.document_id)
        item: dict[str, Any] = {
            "chunk_id": cid,
            "document_id": chunk.document_id,
            "document_title": doc.title if doc else "",
            "file_name": doc.file_name if doc else "",
            "file_type": doc.file_type if doc else "",
            "content": chunk.content,
            "heading_context": chunk.heading_context or "",
            "score": h.get("score", 0),
            "source": h.get("source", "unknown"),
            "metadata": chunk.metadata_ or {},
        }
        if h.get("highlight_content"):
            item["highlight_content"] = h["highlight_content"]
        if h.get("highlight_title"):
            item["highlight_title"] = h["highlight_title"]
        results.append(item)
    return results
