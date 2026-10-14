from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.core.config import settings
from app.core.milvus import TEXT_COLLECTION, get_milvus

logger = logging.getLogger(__name__)

_model = None


def _get_model():
    global _model
    if _model is None:
        import time as _t
        _t0 = _t.monotonic()
        logger.info("正在导入 sentence_transformers 库 ...")
        from sentence_transformers import SentenceTransformer
        logger.info("sentence_transformers 导入完成 (%.1fs)", _t.monotonic() - _t0)
        device = settings.EMBEDDING_DEVICE
        try:
            import torch
            if device == "cuda" and not torch.cuda.is_available():
                device = "cpu"
        except ImportError:
            device = "cpu"
        logger.info("Loading embedding model: %s on %s", settings.EMBEDDING_MODEL, device)
        _model = SentenceTransformer(settings.EMBEDDING_MODEL, device=device)
        logger.info("Embedding model loaded")
    return _model


def preload_model() -> None:
    """Eagerly load the embedding model (call during app startup)."""
    _get_model()


async def encode_texts(texts: list[str]) -> list[list[float]]:
    """Encode texts to vectors using BGE-M3. Runs in thread pool."""
    model = _get_model()
    vectors = await asyncio.to_thread(model.encode, texts, normalize_embeddings=True)
    return vectors.tolist()


async def insert_text_embeddings(
    ids: list[str],
    user_ids: list[str],
    document_ids: list[str],
    embeddings: list[list[float]],
) -> None:
    """Insert text embeddings into Milvus in batches."""
    client = get_milvus()
    batch_size = 50
    for i in range(0, len(ids), batch_size):
        batch = [
            {
                "id": ids[j],
                "user_id": user_ids[j],
                "document_id": document_ids[j],
                "embedding": embeddings[j],
            }
            for j in range(i, min(i + batch_size, len(ids)))
        ]
        client.insert(collection_name=TEXT_COLLECTION, data=batch)
    client.flush(collection_name=TEXT_COLLECTION)


async def search_text_embeddings(
    query_vector: list[float],
    user_id: str,
    top_k: int = 10,
    document_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Search text embeddings with user_id filter."""
    client = get_milvus()
    filter_expr = f'user_id == "{user_id}"'
    if document_ids:
        doc_ids_str = ", ".join(f'"{d}"' for d in document_ids)
        filter_expr += f" and document_id in [{doc_ids_str}]"

    results = client.search(
        collection_name=TEXT_COLLECTION,
        data=[query_vector],
        limit=top_k,
        output_fields=["id", "user_id", "document_id"],
        filter=filter_expr,
    )
    hits = []
    if results:
        for hit in results[0]:
            hits.append({
                "id": hit["entity"]["id"],
                "document_id": hit["entity"]["document_id"],
                "score": hit["distance"],
            })
    return hits


async def delete_text_embeddings(ids: list[str]) -> None:
    """Delete vectors by IDs."""
    if not ids:
        return
    client = get_milvus()
    client.delete(collection_name=TEXT_COLLECTION, ids=ids)
