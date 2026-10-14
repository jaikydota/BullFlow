"""Tencent Cloud VOD AIGC API client for image & video generation."""
from __future__ import annotations

import asyncio
import datetime
import hashlib
import hmac
import json
import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SERVICE = "vod"
HOST = "vod.tencentcloudapi.com"
BASE_URL = f"https://{HOST}/"
API_VERSION = "2018-07-17"
MAX_RETRIES = 3
RETRY_BACKOFF = 15
HTTP_RESP_LOG_MAX = 500


def _resp_preview(text: str, max_len: int = HTTP_RESP_LOG_MAX) -> str:
    if len(text) <= max_len:
        return text
    return f"{text[:max_len]}... (total {len(text)} chars)"


def _sign(payload_str: str, action: str, timestamp: int) -> str:
    """TC3-HMAC-SHA256 signature."""
    # 腾讯 TC3 签名要求 UTC 日期（与 X-TC-Timestamp 一致）；用 fromtimestamp(..., UTC) 避免 utcfromtimestamp 弃用告警
    date = datetime.datetime.fromtimestamp(timestamp, datetime.timezone.utc).strftime("%Y-%m-%d")

    # canonical request
    hashed_payload = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    canonical_request = (
        f"POST\n/\n\n"
        f"content-type:application/json; charset=utf-8\nhost:{HOST}\n\n"
        f"content-type;host\n{hashed_payload}"
    )

    # string to sign
    credential_scope = f"{date}/{SERVICE}/tc3_request"
    hashed_canonical = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
    string_to_sign = f"TC3-HMAC-SHA256\n{timestamp}\n{credential_scope}\n{hashed_canonical}"

    # signing key
    def _hmac_sha256(key: bytes, msg: str) -> bytes:
        return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

    secret_date = _hmac_sha256(("TC3" + settings.TENCENT_SECRET_KEY).encode("utf-8"), date)
    secret_service = _hmac_sha256(secret_date, SERVICE)
    secret_signing = _hmac_sha256(secret_service, "tc3_request")
    signature = hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    authorization = (
        f"TC3-HMAC-SHA256 Credential={settings.TENCENT_SECRET_ID}/{credential_scope}, "
        f"SignedHeaders=content-type;host, Signature={signature}"
    )
    return authorization


def _headers(action: str, payload_str: str) -> dict[str, str]:
    import time
    ts = int(time.time())
    return {
        "Content-Type": "application/json; charset=utf-8",
        "Host": HOST,
        "X-TC-Action": action,
        "X-TC-Version": API_VERSION,
        "X-TC-Timestamp": str(ts),
        "Authorization": _sign(payload_str, action, ts),
    }


async def _request(action: str, payload: dict) -> dict:
    payload_str = json.dumps(payload, separators=(",", ":"))
    headers = _headers(action, payload_str)
    logger.info("[Tencent] POST %s | Action=%s | request_params=%s", BASE_URL, action, payload_str)

    for attempt in range(MAX_RETRIES):
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(BASE_URL, content=payload_str, headers=headers)
            logger.info(
                "[Tencent] Action=%s HTTP %s | response_body: %s",
                action, resp.status_code, _resp_preview(resp.text),
            )
            resp.raise_for_status()
            data = resp.json()
            response = data.get("Response", {})
            error = response.get("Error")
            if error:
                if "RequestLimitExceeded" in error.get("Code", "") and attempt < MAX_RETRIES - 1:
                    wait = RETRY_BACKOFF * (attempt + 1)
                    logger.warning("Tencent rate limit, retrying in %ds (attempt %d)", wait, attempt + 1)
                    await asyncio.sleep(wait)
                    headers = _headers(action, payload_str)
                    continue
                logger.error("[Tencent] API error | Action=%s | Code=%s | Message=%s",
                             action, error.get("Code"), error.get("Message"))
                raise RuntimeError(f"Tencent API error [{error['Code']}]: {error['Message']}")
            return response

    raise RuntimeError("Tencent API max retries exceeded")


async def create_image_task(
    prompt: str,
    *,
    aspect_ratio: str = "1:1",
    image_urls: list[str] | None = None,
) -> str:
    """Create image generation task (Nano Banana 2). Returns TaskId.

    image_urls：参考图 URL 列表（多图融合），每张转成一个 FileInfos 项。
    """
    payload: dict[str, Any] = {
        "SubAppId": settings.TENCENT_VOD_SUB_APP_ID,
        "ModelName": "GEM",
        "ModelVersion": "3.1",
        "Prompt": prompt,
        "OutputConfig": {"StorageMode": "Temporary", "AspectRatio": aspect_ratio},
    }
    refs = [u for u in (image_urls or []) if u]
    if refs:
        payload["FileInfos"] = [{"Type": "Url", "Url": u} for u in refs]

    logger.info("[Tencent] create_image_task | aspect_ratio=%s image_urls=%d prompt=%r",
                aspect_ratio, len(refs), prompt[:120])
    resp = await _request("CreateAigcImageTask", payload)
    task_id = resp["TaskId"]
    logger.info("[Tencent] image task_id=%s created", task_id)
    return task_id


async def create_video_task(
    prompt: str,
    *,
    resolution: str = "1080P",
    duration: int = 5,
    image_url: str | None = None,
    last_image_url: str | None = None,
    enable_audio: bool = True,
) -> str:
    """Create video generation task (Kling 3.0). Returns TaskId.

    image_url：首帧参考图；last_image_url：尾帧参考图（可选，须与首帧同时给）。
    enable_audio：映射到腾讯 OutputConfig.AudioGeneration（"Enabled"/"Disabled"）。
    """
    payload: dict[str, Any] = {
        "SubAppId": settings.TENCENT_VOD_SUB_APP_ID,
        "ModelName": "Kling",
        "ModelVersion": "3.0",
        "Prompt": prompt,
        "OutputConfig": {
            "StorageMode": "Temporary",
            "Resolution": resolution,
            "Duration": duration,
            "AudioGeneration": "Enabled" if enable_audio else "Disabled",
        },
    }
    # 首帧 + 尾帧：FileInfos 按顺序排列，首帧在前、尾帧在后
    file_infos: list[dict] = []
    if image_url:
        file_infos.append({"Type": "Url", "Url": image_url})
        if last_image_url:
            file_infos.append({"Type": "Url", "Url": last_image_url})
    if file_infos:
        payload["FileInfos"] = file_infos

    logger.info(
        "[Tencent] create_video_task | resolution=%s duration=%s audio=%s frames=%d prompt=%r",
        resolution, duration, enable_audio, len(file_infos), prompt[:120],
    )
    resp = await _request("CreateAigcVideoTask", payload)
    task_id = resp["TaskId"]
    logger.info("[Tencent] video task_id=%s created", task_id)
    return task_id


async def poll_task(task_id: str, *, timeout: int | None = None) -> str:
    """
    Poll DescribeTaskDetail until FINISH/FAIL. Returns file URL.
    """
    timeout = timeout or settings.VIDEO_POLL_TIMEOUT
    interval = settings.VIDEO_POLL_INTERVAL
    elapsed = 0
    logger.info("[Tencent] start polling task_id=%s interval=%ss timeout=%ss", task_id, interval, timeout)

    while elapsed < timeout:
        resp = await _request("DescribeTaskDetail", {
            "SubAppId": settings.TENCENT_VOD_SUB_APP_ID,
            "TaskId": task_id,
        })
        status = resp.get("Status", "")
        # 摘取任务进度字段（图片/视频均适用）
        # 注意：腾讯响应里两个字段都会出现，未使用的那个值为 None；dict.get 的 default 仅在
        # key 缺失时生效，对 value=None 不生效，所以必须用 `or {}` 兜底
        progress = (resp.get("AigcImageTask") or resp.get("AigcVideoTask") or {}).get("Progress", "—")
        logger.info(
            "[Tencent] poll task_id=%s elapsed=%ss status=%s progress=%s",
            task_id, elapsed, status, progress,
        )

        if status == "FINISH":
            url = _extract_url(resp)
            logger.info("[Tencent] task_id=%s FINISH, url=%s", task_id, url)
            return url
        if status == "FAIL":
            # 同上：图片/视频任意一方失败都要能拿到 ErrMsg；None.get 会崩，用 `or {}` 兜底
            err_msg = str((resp.get("AigcVideoTask") or resp.get("AigcImageTask") or {}).get("ErrMsg", ""))
            logger.error(
                "[Tencent] task_id=%s FAIL | ErrMsg=%s | response_body: %s",
                task_id, err_msg, _resp_preview(json.dumps(resp, ensure_ascii=False, default=str)),
            )
            raise RuntimeError(f"Tencent task {task_id} failed: {err_msg}")

        await asyncio.sleep(interval)
        elapsed += interval

    raise RuntimeError(f"Tencent task {task_id} timed out after {timeout}s")


def _extract_url(resp: dict) -> str:
    """Extract file URL from DescribeTaskDetail response."""
    for key in ("AigcImageTask", "AigcVideoTask"):
        task_data = resp.get(key)
        if not task_data:
            continue
        output = task_data.get("Output", {})
        # priority: FileInfos[0].FileUrl > FileUrl > MediaUrl > Url
        file_infos = output.get("FileInfos", [])
        if file_infos:
            url = file_infos[0].get("FileUrl")
            if url:
                return url
        for field in ("FileUrl", "MediaUrl", "Url"):
            url = output.get(field)
            if url:
                return url

    raise RuntimeError("Cannot extract URL from Tencent task response")


def _size_to_aspect_ratio(size: str) -> str:
    """Convert size string (e.g. 1920x1080) to aspect ratio."""
    mapping = {
        "1920x1920": "1:1", "1024x1024": "1:1",
        "1920x1080": "16:9", "2560x1440": "16:9",
        "1080x1920": "9:16",
    }
    return mapping.get(size, "1:1")


async def generate_image(
    prompt: str,
    *,
    size: str = "1920x1080",
    image_urls: list[str] | None = None,
) -> str:
    """Full flow: create task -> poll -> return image URL."""
    aspect_ratio = _size_to_aspect_ratio(size)
    task_id = await create_image_task(prompt, aspect_ratio=aspect_ratio, image_urls=image_urls)
    logger.info("Tencent image task created: %s", task_id)
    return await poll_task(task_id, timeout=180)


async def generate_video(
    prompt: str,
    *,
    resolution: str = "1080P",
    duration: int = 5,
    image_url: str | None = None,
    last_image_url: str | None = None,
    enable_audio: bool = True,
) -> str:
    """Full flow: create task -> poll -> return video URL。image_url=首帧，last_image_url=尾帧。"""
    logger.info(
        "[Tencent] generate_video start | resolution=%s duration=%s audio=%s",
        resolution, duration, enable_audio,
    )
    task_id = await create_video_task(
        prompt, resolution=resolution, duration=duration,
        image_url=image_url, last_image_url=last_image_url, enable_audio=enable_audio,
    )
    logger.info("[Tencent] video task created: %s", task_id)
    return await poll_task(task_id)
