"""Azure OpenAI gpt-image-2 client.

直接用 httpx 走 Azure OpenAI 的 images endpoints（不通过 OpenAI SDK，因为
当前 AZURE_OPENAI_BASE_URL 是 chat 兼容网关，路径结构不同）。

两个端点：
- text-to-image: POST AZURE_IMAGE_GENERATIONS_URL  (JSON body)
- 图生图 edits: POST AZURE_IMAGE_EDITS_URL         (multipart/form-data)

响应 schema 统一：`{"data": [{"b64_json": "..."}]}`，本模块负责 base64 decode，
对外返回原始图片二进制（bytes），调用方再上传 MinIO。
"""
from __future__ import annotations

import base64
import json
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

HTTP_RESP_LOG_MAX = 500


def _resp_preview(text: str, max_len: int = HTTP_RESP_LOG_MAX) -> str:
    """控制台日志用：响应 body 截断，避免刷屏。"""
    if len(text) <= max_len:
        return text
    return f"{text[:max_len]}... (total {len(text)} chars)"


def _auth_header() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.AZURE_OPENAI_API_KEY}"}


def _decode_b64_response(resp_json: dict) -> bytes:
    """从响应 JSON 中提取 data[0].b64_json 并 decode 为 bytes。"""
    data = resp_json.get("data") or []
    if not data:
        raise RuntimeError(f"Azure images 响应缺 data 字段：{json.dumps(resp_json, ensure_ascii=False)[:300]}")
    b64 = data[0].get("b64_json")
    if not b64:
        raise RuntimeError(
            f"Azure images 响应 data[0] 缺 b64_json：{json.dumps(data[0], ensure_ascii=False)[:300]}"
        )
    return base64.b64decode(b64)


async def generate_image(
    prompt: str,
    *,
    size: str = "1024x1024",
    quality: str = "high",
    output_format: str = "png",
) -> bytes:
    """text-to-image 调用。返回图片二进制。"""
    url = settings.AZURE_IMAGE_GENERATIONS_URL
    if not url:
        raise RuntimeError("AZURE_IMAGE_GENERATIONS_URL 未配置")

    payload: dict = {
        "prompt": prompt,
        "size": size,
        "quality": quality,
        "output_format": output_format,
        "n": 1,
    }
    logger.info(
        "[Azure-Image] POST %s | request_params=%s",
        url,
        json.dumps(payload, ensure_ascii=False, default=str),
    )

    async with httpx.AsyncClient(timeout=float(settings.AZURE_IMAGE_TIMEOUT)) as client:
        resp = await client.post(url, json=payload, headers={**_auth_header(), "Content-Type": "application/json"})
        logger.info(
            "[Azure-Image] generations response HTTP %s | body: %s",
            resp.status_code,
            _resp_preview(resp.text),
        )
        resp.raise_for_status()
        data = resp.json()

    image_bytes = _decode_b64_response(data)
    logger.info("[Azure-Image] generations 解码完成 | size=%d bytes", len(image_bytes))
    return image_bytes


async def edit_image(
    prompt: str,
    images: list[tuple[bytes, str, str]],
    *,
    size: str = "1024x1024",
    quality: str = "high",
) -> bytes:
    """图生图 edits 调用（multipart 上传 1~N 张参考图，不传 mask = 整图重绘）。

    images：每项为 (image_bytes, filename, mime)。gpt-image edits 支持多张输入图，
    多张时字段名用 `image[]`，单张用 `image`（与 OpenAI/Azure 约定一致）。
    """
    url = settings.AZURE_IMAGE_EDITS_URL
    if not url:
        raise RuntimeError("AZURE_IMAGE_EDITS_URL 未配置")
    if not images:
        raise RuntimeError("edit_image 至少需要一张参考图")

    field = "image" if len(images) == 1 else "image[]"
    # httpx 支持同名字段重复上传多文件：list[(field, (filename, bytes, mime))]
    files = [(field, (fn, b, mime)) for (b, fn, mime) in images]
    # multipart 字段：prompt 必填；size / quality 可选
    form_data = {
        "prompt": prompt,
        "size": size,
        "quality": quality,
        "n": "1",
    }
    logger.info(
        "[Azure-Image] POST %s | images=%d total_bytes=%d | request_params=%s",
        url,
        len(images),
        sum(len(b) for b, _, _ in images),
        json.dumps(form_data, ensure_ascii=False, default=str),
    )

    async with httpx.AsyncClient(timeout=float(settings.AZURE_IMAGE_TIMEOUT)) as client:
        resp = await client.post(url, files=files, data=form_data, headers=_auth_header())
        logger.info(
            "[Azure-Image] edits response HTTP %s | body: %s",
            resp.status_code,
            _resp_preview(resp.text),
        )
        resp.raise_for_status()
        data = resp.json()

    image_bytes_out = _decode_b64_response(data)
    logger.info("[Azure-Image] edits 解码完成 | size=%d bytes", len(image_bytes_out))
    return image_bytes_out
