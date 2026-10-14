"""Volcano Engine Ark API client for image & video generation."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

TIMEOUT_IMAGE = 120.0
TIMEOUT_VIDEO_CREATE = 30.0
HTTP_RESP_LOG_MAX = 500


def _resp_preview(text: str, max_len: int = HTTP_RESP_LOG_MAX) -> str:
    """控制台日志用：响应 body 截断，避免刷屏。"""
    if len(text) <= max_len:
        return text
    return f"{text[:max_len]}... (total {len(text)} chars)"


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.ARK_API_KEY}",
        "Content-Type": "application/json",
    }


async def generate_image(
    prompt: str,
    *,
    size: str = "1920x1080",
    image_urls: list[str] | None = None,
) -> str:
    """
    Image generation via Seedream 5.0 (synchronous API, returns URL directly).
    Returns the generated image URL.
    """
    url = f"{settings.DOUBAO_BASE_URL}/images/generations"
    payload: dict[str, Any] = {
        "model": settings.DOUBAO_IMAGE_MODEL,
        "prompt": prompt,
        "sequential_image_generation": "disabled",
        "response_format": "url",
        "size": size,
        "stream": False,
        "watermark": False,
    }
    if image_urls:
        payload["image_urls"] = image_urls

    params_json = json.dumps(payload, ensure_ascii=False, default=str)
    logger.info("[Doubao] POST %s | request_params=%s", url, params_json)

    async with httpx.AsyncClient(timeout=TIMEOUT_IMAGE) as client:
        resp = await client.post(url, json=payload, headers=_headers())
        logger.info(
            "[Doubao] generate_image HTTP %s | body: %s",
            resp.status_code, _resp_preview(resp.text),
        )
        resp.raise_for_status()
        data = resp.json()
        image_url = data["data"][0]["url"]
        logger.info("[Doubao] generate_image result url=%s", image_url)
        return image_url


async def create_video_task(
    prompt: str,
    *,
    resolution: str = "1080p",
    duration: int = 5,
    image_url: str | None = None,
    last_image_url: str | None = None,
    enable_audio: bool = True,
) -> str:
    """
    Create async video generation task via Seedance 2.0.
    Returns task_id for polling. image_url=首帧，last_image_url=尾帧（可选）。
    """
    url = f"{settings.DOUBAO_BASE_URL}/contents/generations/tasks"
    # Doubao Seedance 通过 prompt 内拼接 `--key value` 形式控制参数；
    # `--audio true/false` 控制是否生成原生背景音/音效
    audio_flag = "true" if enable_audio else "false"
    text_value = (
        f"{prompt}  --resolution {resolution}  --duration {duration} "
        f"--camerafixed false --audio {audio_flag}"
    )
    content: list[dict] = [{"type": "text", "text": text_value}]
    # 首帧 / 尾帧通过 image_url 项的 role 区分（仅给首帧时不带 role，兼容纯图生视频）
    if image_url and last_image_url:
        content.append({"type": "image_url", "image_url": {"url": image_url}, "role": "first_frame"})
        content.append({"type": "image_url", "image_url": {"url": last_image_url}, "role": "last_frame"})
    elif image_url:
        content.append({"type": "image_url", "image_url": {"url": image_url}})

    payload = {"model": settings.DOUBAO_VIDEO_MODEL, "content": content}
    params_json = json.dumps(payload, ensure_ascii=False, default=str)
    logger.info("[Doubao] POST %s | request_params=%s", url, params_json)

    async with httpx.AsyncClient(timeout=TIMEOUT_VIDEO_CREATE) as client:
        resp = await client.post(url, json=payload, headers=_headers())
        logger.info(
            "[Doubao] create_video_task response HTTP %s | body: %s",
            resp.status_code, _resp_preview(resp.text),
        )
        resp.raise_for_status()
        data = resp.json()
        task_id = data["id"]
        logger.info("[Doubao] video task_id=%s status=%s", task_id, data.get("status"))
        return task_id


async def poll_video_task(task_id: str) -> str:
    """
    Poll until video task completes. Returns the video URL.
    Raises RuntimeError on failure or timeout.
    """
    url = f"{settings.DOUBAO_BASE_URL}/contents/generations/tasks/{task_id}"
    interval = settings.VIDEO_POLL_INTERVAL
    timeout = settings.VIDEO_POLL_TIMEOUT
    elapsed = 0
    logger.info("[Doubao] start polling task_id=%s interval=%ss timeout=%ss", task_id, interval, timeout)

    async with httpx.AsyncClient(timeout=30) as client:
        while elapsed < timeout:
            resp = await client.get(url, headers=_headers())
            resp.raise_for_status()
            data = resp.json()
            status = data.get("status", "")
            logger.info(
                "[Doubao] GET %s | poll task_id=%s elapsed=%ss status=%s | response_body: %s",
                url, task_id, elapsed, status, _resp_preview(resp.text),
            )

            if status == "succeeded":
                video_url = data["content"]["video_url"]
                logger.info("[Doubao] task_id=%s succeeded, video_url=%s", task_id, video_url)
                return video_url
            if status == "failed":
                err = data.get("error") or data.get("message") or "unknown"
                logger.error(
                    "[Doubao] task_id=%s failed: %s | response_body: %s",
                    task_id, err, _resp_preview(resp.text),
                )
                raise RuntimeError(f"Doubao video task {task_id} failed: {err}")

            await asyncio.sleep(interval)
            elapsed += interval

    raise RuntimeError(f"Doubao video task {task_id} timed out after {timeout}s")


async def generate_video(
    prompt: str,
    *,
    resolution: str = "1080p",
    duration: int = 5,
    image_url: str | None = None,
    last_image_url: str | None = None,
    enable_audio: bool = True,
) -> str:
    """Full flow: create task -> poll -> return video URL。image_url=首帧，last_image_url=尾帧。"""
    logger.info(
        "[Doubao] generate_video start | resolution=%s duration=%s audio=%s",
        resolution, duration, enable_audio,
    )
    task_id = await create_video_task(
        prompt, resolution=resolution, duration=duration,
        image_url=image_url, last_image_url=last_image_url, enable_audio=enable_audio,
    )
    return await poll_video_task(task_id)
