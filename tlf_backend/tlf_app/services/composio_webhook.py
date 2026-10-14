"""Composio webhook 处理：连接生命周期事件 → 同步 MediaAccount 状态。

事件 type 形如 `composio.connected_account.expired` / `...active`，payload：
  {type, data:{id(connection_id), toolkit:{slug}, status, status_reason}, timestamp, ...}
按 data.id 反查 provider_account_ref==id 的 MediaAccount，置 expired / active。
落账（首次激活）仍以轮询 /auth/status 为主，这里只兜账号状态变更。
"""
from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.models.media_account import MediaAccount
from tlf_app.services import composio_client

logger = logging.getLogger(__name__)


async def handle_composio_webhook(db: AsyncSession, body: dict) -> dict:
    etype = str(body.get("type") or "")
    data = body.get("data") or {}
    connection_id = data.get("id") or data.get("connectedAccountId")
    status = str(data.get("status") or "").upper()
    if not connection_id:
        logger.info("[composio-webhook] 缺 connection id，忽略 type=%s", etype)
        return {"handled": False, "reason": "no connection id"}

    media = (await db.execute(
        select(MediaAccount).where(MediaAccount.provider_account_ref == connection_id)
    )).scalar_one_or_none()
    if media is None:
        logger.info("[composio-webhook] 未知连接 %s（type=%s），忽略", connection_id, etype)
        return {"handled": False, "reason": "unknown connection"}

    now = datetime.utcnow()
    if etype.endswith("connected_account.expired") or composio_client.is_connection_expired(status):
        media.status = "expired"
        media.last_sync_at = now
        await db.flush()
        logger.info("[composio-webhook] 账号 %s 连接过期 → expired", media.account_id)
        return {"handled": True, "action": "expired", "account_id": media.account_id}

    if status == composio_client.STATUS_ACTIVE:
        media.status = "active"
        media.last_sync_at = now
        await db.flush()
        logger.info("[composio-webhook] 账号 %s 连接激活 → active", media.account_id)
        return {"handled": True, "action": "active", "account_id": media.account_id}

    return {"handled": False, "reason": f"unhandled type={etype} status={status}"}
