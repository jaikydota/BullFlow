"""Webhook 转发器：把灵径原始 body 用子租户 webhook_secret 重签名后透传。

调用流程：
1. tlf_backend `/api/webhooks/lapi` 收到灵径事件，验签通过后落 webhook_events 表
2. 触发 forward_event(event_id) 异步执行
3. 失败重试 N 次（指数退避），仍失败则标记 forward_status=dead

签名格式（与灵径原生格式一致，仅 secret 不同）：
    X-Webhook-Timestamp: {unix_second}
    X-Webhook-Signature: sha256=hex(HMAC-SHA256(webhook_secret, "{timestamp}.{raw_body}"))
"""
from __future__ import annotations

import asyncio
import logging
import time

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from urllib.parse import urlsplit

from tlf_app.core.config import settings
from tlf_app.core.database import async_session_factory
from tlf_app.core.log_context import set_request_id
from tlf_app.core.security import hmac_sha256_hex
from tlf_app.models.developer_app import DeveloperApp
from tlf_app.models.webhook_event import WebhookEvent

logger = logging.getLogger(__name__)


def _host(url: str) -> str:
    """只取 host 用于日志（不暴露完整路径/query）。"""
    try:
        return urlsplit(url).netloc or url
    except Exception:  # noqa: BLE001
        return url


async def _post_with_signature(
    url: str,
    raw_body: bytes,
    webhook_secret: str,
    *,
    timeout: int,
) -> tuple[int, str]:
    """对 raw_body 重签名后 POST 到子租户 URL。返回 (http_status, body_preview)。"""
    timestamp = str(int(time.time()))
    msg = f"{timestamp}.".encode("utf-8") + raw_body
    signature = "sha256=" + hmac_sha256_hex(webhook_secret, msg)
    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Timestamp": timestamp,
        "X-Webhook-Signature": signature,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, content=raw_body, headers=headers)
    preview = resp.text[:200] if resp.text else ""
    return resp.status_code, preview


async def forward_event(event_id: str) -> None:
    """转发单个事件（含重试 + 死信落库）。

    在 BackgroundTask 中调用。新开一个 session（与请求 session 解耦）。
    """
    set_request_id(f"wh-{str(event_id)[:6]}")  # 后台任务独立上下文，给个可串联的 rid
    async with async_session_factory() as db:
        try:
            await _forward_one(db, event_id)
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("[webhook-forward] event=%s 出现未捕获异常", event_id)


async def _forward_one(db: AsyncSession, event_id: str) -> None:
    event = (await db.execute(select(WebhookEvent).where(WebhookEvent.id == event_id))).scalar_one_or_none()
    if event is None:
        logger.warning("[webhook-forward] event %s 不存在", event_id)
        return
    if event.forward_status in ("ok", "dead", "skipped"):
        return
    if event.app_id is None:
        # 找不到归属租户，标记 skipped
        event.forward_status = "skipped"
        event.last_error = "事件无 app_id 归属（callBackData 缺失）"
        await db.flush()
        return

    app = (await db.execute(select(DeveloperApp).where(DeveloperApp.id == event.app_id))).scalar_one_or_none()
    if app is None or app.status != "active":
        event.forward_status = "skipped"
        event.last_error = f"租户不可用 app_id={event.app_id}"
        await db.flush()
        return
    if not app.webhook_url:
        event.forward_status = "skipped"
        event.last_error = "租户未配置 webhook_url"
        await db.flush()
        return

    raw_body = (event.raw_body_text or "").encode("utf-8")
    et = event.lapi_event_type
    backoff = settings.forward_backoff_seconds()
    max_retries = settings.WEBHOOK_FORWARD_MAX_RETRIES
    logger.info("[WEBHOOK-FWD] event=%s type=%s app=%s → %s 开始转发", event_id, et, app.app_id, _host(app.webhook_url))

    for attempt in range(1, max_retries + 1):
        event.forward_attempts = attempt
        try:
            status, preview = await _post_with_signature(
                app.webhook_url, raw_body, app.webhook_secret,
                timeout=settings.WEBHOOK_FORWARD_TIMEOUT,
            )
            if 200 <= status < 300:
                event.forward_status = "ok"
                event.forwarded_at = _now_naive()
                event.last_error = None
                await db.flush()
                logger.info("[WEBHOOK-FWD] event=%s type=%s app=%s ok status=%s attempt=%s",
                            event_id, et, app.app_id, status, attempt)
                return
            event.last_error = f"HTTP {status}: {preview}"
            logger.warning(
                "[WEBHOOK-FWD] event=%s type=%s app=%s attempt=%s 非 2xx：%s",
                event_id, et, app.app_id, attempt, event.last_error,
            )
        except Exception as exc:
            event.last_error = f"{type(exc).__name__}: {exc}"
            logger.warning(
                "[WEBHOOK-FWD] event=%s type=%s app=%s attempt=%s 异常：%s",
                event_id, et, app.app_id, attempt, event.last_error,
            )

        if attempt < max_retries:
            # 退避（最后一次失败不睡）
            delay = backoff[min(attempt - 1, len(backoff) - 1)] if backoff else 1
            await db.flush()
            await asyncio.sleep(delay)

    event.forward_status = "dead"
    await db.flush()
    logger.error("[webhook-forward] event=%s app=%s 达到最大重试 %s 次仍失败", event_id, app.app_id, max_retries)


def _now_naive():
    """返回不带时区的当前 utc datetime（与 SQLAlchemy DateTime 兼容）。"""
    from datetime import datetime
    return datetime.utcnow()


__all__ = ["forward_event"]
