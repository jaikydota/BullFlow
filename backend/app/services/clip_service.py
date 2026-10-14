from __future__ import annotations

import asyncio
import io
import logging
import time

from app.core.config import settings
from app.core.milvus import IMAGE_COLLECTION, get_milvus

logger = logging.getLogger(__name__)

_model = None
_preprocess = None
_tokenizer = None


def _load_clip():
    global _model, _preprocess, _tokenizer
    if _model is None:
        import open_clip
        import torch
        device = settings.CLIP_DEVICE
        if device == "cuda" and not torch.cuda.is_available():
            device = "cpu"
        model_name, pretrained = "ViT-L-14", "openai"
        logger.info("CLIP 模型加载中: %s (设备=%s)", model_name, device)
        _model, _, _preprocess = open_clip.create_model_and_transforms(model_name, pretrained=pretrained)
        _tokenizer = open_clip.get_tokenizer(model_name)
        _model = _model.to(device).eval()
        logger.info("CLIP 模型加载完成: %s", model_name)
    return _model, _preprocess, _tokenizer


def preload_clip() -> None:
    """Eagerly load the CLIP model (call during app startup)."""
    _load_clip()


async def encode_image(image_bytes: bytes, image_id: str = "") -> list[float]:
    """Encode an image to a CLIP vector."""
    import torch
    from PIL import Image as PILImage

    label = f"[图片ID={image_id}]" if image_id else ""
    logger.info("CLIP 开始编码图片 %s (大小=%.1f KB)", label, len(image_bytes) / 1024)
    t0 = time.perf_counter()

    model, preprocess, _ = _load_clip()
    img = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
    tensor = preprocess(img).unsqueeze(0).to(settings.CLIP_DEVICE)

    def _encode():
        with torch.no_grad():
            features = model.encode_image(tensor)
            features /= features.norm(dim=-1, keepdim=True)
            return features.cpu().numpy()[0].tolist()

    result = await asyncio.to_thread(_encode)
    logger.info("CLIP 图片编码完成 %s 耗时=%.2fs, 向量维度=%d", label, time.perf_counter() - t0, len(result))
    return result


async def encode_text_for_image_search(text: str) -> list[float]:
    """Encode text to a CLIP vector for image similarity search."""
    import torch

    logger.info("CLIP 文本编码开始: query=%r", text[:80])
    t0 = time.perf_counter()

    model, _, tokenizer = _load_clip()
    tokens = tokenizer([text]).to(settings.CLIP_DEVICE)

    def _encode():
        with torch.no_grad():
            features = model.encode_text(tokens)
            features /= features.norm(dim=-1, keepdim=True)
            return features.cpu().numpy()[0].tolist()

    result = await asyncio.to_thread(_encode)
    logger.info("CLIP 文本编码完成: 耗时=%.2fs", time.perf_counter() - t0)
    return result


async def insert_image_embedding(image_id: str, user_id: str, embedding: list[float]) -> None:
    logger.info("Milvus 写入图片向量: image_id=%s, 集合=%s", image_id, IMAGE_COLLECTION)
    t0 = time.perf_counter()
    client = get_milvus()
    client.insert(
        collection_name=IMAGE_COLLECTION,
        data=[{"id": image_id, "user_id": user_id, "embedding": embedding}],
    )
    client.flush(collection_name=IMAGE_COLLECTION)
    logger.info("Milvus 写入完成: image_id=%s 耗时=%.2fs", image_id, time.perf_counter() - t0)


async def search_image_embeddings(query_vector: list[float], user_id: str, top_k: int = 20) -> list[dict]:
    logger.info("Milvus 图片检索开始: user_id=%s, top_k=%d", user_id, top_k)
    t0 = time.perf_counter()
    client = get_milvus()
    results = client.search(
        collection_name=IMAGE_COLLECTION,
        data=[query_vector],
        limit=top_k,
        output_fields=["id", "user_id"],
        filter=f'user_id == "{user_id}"',
    )
    hits = []
    if results:
        for hit in results[0]:
            hits.append({"id": hit["entity"]["id"], "score": hit["distance"]})
    logger.info(
        "Milvus 图片检索完成: 命中=%d 条 | 评分范围 [%.4f, %.4f], 耗时=%.2fs",
        len(hits),
        hits[-1]["score"] if hits else 0,
        hits[0]["score"] if hits else 0,
        time.perf_counter() - t0,
    )
    if settings.IMAGE_SCORE_THRESHOLD > 0 and hits:
        before = len(hits)
        hits = [h for h in hits if h["score"] >= settings.IMAGE_SCORE_THRESHOLD]
        logger.info(
            "CLIP 图片检索阈值过滤(≥%.2f): %d → %d 条",
            settings.IMAGE_SCORE_THRESHOLD,
            before,
            len(hits),
        )
    return hits


async def delete_image_embedding(image_id: str) -> None:
    logger.info("Milvus 删除图片向量: image_id=%s", image_id)
    client = get_milvus()
    client.delete(collection_name=IMAGE_COLLECTION, ids=[image_id])
    logger.info("Milvus 向量删除完成: image_id=%s", image_id)
