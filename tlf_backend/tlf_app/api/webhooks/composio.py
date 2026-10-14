"""接收 Composio webhook（连接生命周期：过期 / 激活）。

Composio dashboard 配 webhook URL = `https://{tlf-domain}/api/webhooks/composio`，
下发 `COMPOSIO_WEBHOOK_SECRET` 用于验签。Composio 为 svix 风格：三个头
`webhook-id` / `webhook-timestamp` / `webhook-signature`（后者形如 `v1,<base64>`），
签名串 = `{id}.{timestamp}.{raw_body}`，HMAC-SHA256 → base64，默认 5min 时间窗。
验签交给官方 SDK `triggers.verify_webhook`（见 composio_client.verify_webhook）。

收紧策略：**配了 secret 则强制验签，失败返回 401**；未配 secret（本地/未接入）放行。
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.database import get_db
from tlf_app.core.exceptions import BadRequestError
from tlf_app.schemas.common import ok
from tlf_app.services import composio_client
from tlf_app.services.composio_webhook import handle_composio_webhook

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/composio")
async def composio_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    raw_body = await request.body()
    webhook_id = request.headers.get("webhook-id", "")
    timestamp = request.headers.get("webhook-timestamp", "")
    signature = request.headers.get("webhook-signature", "")
    logger.info("[COMPOSIO-WEBHOOK] 收到回调 id=%s sig=%s… body=%dB",
                webhook_id or "-", (signature or "-")[:14], len(raw_body))

    ok_sig = await composio_client.verify_webhook(
        webhook_id=webhook_id, timestamp=timestamp, signature=signature, raw_body=raw_body,
    )
    if not ok_sig:
        logger.warning("[COMPOSIO-WEBHOOK] 验签未通过，拒绝（id=%s）", webhook_id or "-")
        return JSONResponse(status_code=401, content={"code": 40100, "message": "invalid signature"})

    try:
        body = json.loads(raw_body.decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise BadRequestError(f"composio webhook body 非合法 JSON：{exc}")
    res = await handle_composio_webhook(db, body)
    await db.commit()
    return ok(res)
