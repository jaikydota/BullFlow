"""接收灵径 webhook 入口。

灵径平台 UI 上 webhook URL 配为：`https://{tlf-domain}/api/webhooks/lapi`（本地用内网穿透指向 8041）

流程：
1. 验签（HMAC-SHA256 + 时间戳窗口 + Redis nonce 防重放）
2. 落 webhook_events 表
3. 同步更新本地 lapi_accounts / publish_tasks / account_metrics
4. 触发 BackgroundTask 把原 body 用子租户 webhook_secret 重签名后转发到子租户 URL
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.database import get_db
from tlf_app.schemas.common import ok
from tlf_app.services.webhook_forward import forward_event
from tlf_app.services.webhook_handler import (
    apply_event_to_local_tables,
    verify_and_log_event,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/lapi")
async def lapi_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    x_webhook_timestamp: str = Header(default=""),
    x_webhook_signature: str = Header(default=""),
):
    raw_body = await request.body()
    logger.info("[WEBHOOK-RECV] 收到灵径回调 ts=%s sig=%s… body=%dB",
                x_webhook_timestamp or "-", (x_webhook_signature or "-")[:18], len(raw_body))
    # 验签失败会抛 BadRequestError，由统一异常处理器记日志（含 path + message）
    event = await verify_and_log_event(
        db,
        raw_body=raw_body,
        timestamp=x_webhook_timestamp,
        signature=x_webhook_signature,
    )
    await apply_event_to_local_tables(db, event)
    # webhook 落库 + 本地表更新都必须在转发前 commit，转发器开新 session 才能读到
    await db.commit()
    background_tasks.add_task(forward_event, event.id)
    return ok({"event_id": event.id, "queued_forward": True})
