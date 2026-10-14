from __future__ import annotations

import asyncio
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

_model = None


def _load_reranker():
    global _model
    if _model is None:
        from sentence_transformers import CrossEncoder
        device = settings.RERANKER_DEVICE
        try:
            import torch
            if device == "cuda" and not torch.cuda.is_available():
                device = "cpu"
        except ImportError:
            device = "cpu"
        logger.info("Loading reranker model: %s on %s", settings.RERANKER_MODEL, device)
        _model = CrossEncoder(settings.RERANKER_MODEL, device=device)
        logger.info("Reranker model loaded")
    return _model


def preload_model() -> None:
    """启动时预加载重排序模型（MODEL_PRELOAD_ENABLED=true 时调用）。"""
    _load_reranker()


async def rerank(query: str, passages: list[str], top_k: int | None = None) -> list[dict]:
    """
    Rerank passages by relevance to query using BGE-Reranker cross-encoder.

    Returns list of {"index": int, "score": float} sorted by score descending.
    """
    if not passages:
        return []

    model = _load_reranker()
    pairs = [[query, p] for p in passages]

    def _score():
        scores = model.predict(pairs)
        return scores

    raw_scores = await asyncio.to_thread(_score)

    ranked = [{"index": i, "score": float(s)} for i, s in enumerate(raw_scores)]
    ranked.sort(key=lambda x: x["score"], reverse=True)

    if top_k:
        ranked = ranked[:top_k]

    return ranked
