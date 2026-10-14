"""推量发 Webhook 接收端点

公开端点（无需登录），靠 HMAC-SHA256 签名验证。
失败返回 401；成功返回 {ok, event}。

推量发网关 后台只能配一个 webhook URL，所有事件（authResult / publishResult /
publishProcess / auditStatus / accountStatus / accountOverview / contentList）
都打到这同一个 URL，按 `data.event` 字段分发到具体 handler。

唯一对外路径：

    POST /api/v1/webhooks/tlf
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.schemas.common import success
from app.services.tlf_webhook_service import (
    consume_nonce,
    handle_account_overview,
    handle_account_status,
    handle_audit_status,
    handle_auth_result,
    handle_publish_progress,
    handle_publish_result,
    verify_signature,
)


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks/tlf", tags=["国内分发-推量发 Webhook"])


def _extract_event(payload: dict) -> tuple[str | None, dict]:
    """从 payload 提取事件类型与事件数据对象。

    实际推送形态：{ "data": { "event": "authResult", ... }, "timestamp": ... }
    部分历史 / 测试形态直接是 { "event": "...", ... }，两种都兼容。
    """
    if not isinstance(payload, dict):
        return None, {}
    if "event" in payload:
        return str(payload.get("event") or ""), payload
    inner = payload.get("data")
    if isinstance(inner, dict) and "event" in inner:
        return str(inner.get("event") or ""), inner
    return None, payload


@router.post("")
async def tlf_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_webhook_timestamp: str | None = Header(None, alias="X-Webhook-Timestamp"),
    x_webhook_signature: str | None = Header(None, alias="X-Webhook-Signature"),
):
    """统一 webhook 入口：POST /api/v1/webhooks/tlf。

    支持的事件：authResult / publishResult / publishProcess / auditStatus /
    accountStatus / accountOverview。其余未知事件仅打日志不报错。
    """
    raw = await request.body()

    # 入口先打一行 "收到 webhook" 日志，覆盖请求大小、header、body 预览，方便排错
    body_preview = raw[:500].decode("utf-8", errors="replace")
    logger.info(
        "[TLF-WH] 收到 webhook | body_len=%d ts=%s sig=%s\n  body_preview=%s",
        len(raw),
        x_webhook_timestamp,
        (x_webhook_signature[:16] + "...") if x_webhook_signature else None,
        body_preview,
    )

    verify_signature(raw, x_webhook_timestamp, x_webhook_signature)
    await consume_nonce(x_webhook_signature or "")
    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    event_type, event_data = _extract_event(payload)
    logger.info("[TLF-WH] 验签通过 event=%s", event_type)

    if event_type == "authResult":
        await handle_auth_result(db, event_data)
    elif event_type == "publishResult":
        await handle_publish_result(db, event_data)
    elif event_type == "publishProcess":
        await handle_publish_progress(db, event_data)
    elif event_type == "auditStatus":
        await handle_audit_status(db, event_data)
    elif event_type == "accountStatus":
        await handle_account_status(db, event_data)
    elif event_type == "accountOverview":
        await handle_account_overview(db, event_data)
    elif event_type:
        logger.warning("[TLF-WH] 未知事件类型：%s", event_type)
    else:
        logger.warning("[TLF-WH] payload 缺 event 字段，忽略：%s", payload)

    return success(data={"ok": True, "event": event_type or "unknown"}, message="ok")
