"""支付网关异步回调入口。

- POST /api/v1/webhooks/allinpay
    通联异步回调：application/x-www-form-urlencoded
    正确处理须**返回纯文本 success**（小写，doc/2331），否则通联按
    15s/15s/5m/10m/15m/20m/25m/30m 共 8 次重发。

安全：
- RSA 验签（公钥取自 settings.ALLINPAY_PUBLIC_KEY）；验签失败时自动降级为「主动查单」兜底闭环
- 可选 IP 白名单（settings.ALLINPAY_CALLBACK_IP_WHITELIST 逗号分隔）
- 状态机幂等（重复回调返回 success 但不重复激活）
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_db
from app.services.saas_billing import handle_allinpay_callback

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["支付回调"])


def _check_ip_whitelist(client_ip: str | None) -> bool:
    raw = (settings.ALLINPAY_CALLBACK_IP_WHITELIST or "").strip()
    if not raw:
        return True
    whitelist = {ip.strip() for ip in raw.split(",") if ip.strip()}
    return (client_ip or "") in whitelist


@router.post("/allinpay")
async def allinpay_callback(request: Request, db: AsyncSession = Depends(get_db)):
    client_ip = request.client.host if request.client else None
    if not _check_ip_whitelist(client_ip):
        logger.warning("[ALLINPAY-CALLBACK] reject ip=%s", client_ip)
        return PlainTextResponse("FAIL")

    # 通联 application/x-www-form-urlencoded
    form = await request.form()
    params = {k: str(v) for k, v in form.items()}
    logger.info(
        "[ALLINPAY-CALLBACK] inbound ip=%s content-type=%s field_count=%d params=%s",
        client_ip,
        request.headers.get("content-type"),
        len(params),
        params,
    )

    try:
        ok, body = await handle_allinpay_callback(db, params)
    except Exception:
        logger.exception(
            "[ALLINPAY-CALLBACK] handler error | ip=%s params=%s", client_ip, params
        )
        return PlainTextResponse("FAIL")
    reply = body if ok else "FAIL"
    logger.info("[ALLINPAY-CALLBACK] reply=%s ip=%s", reply, client_ip)
    return PlainTextResponse(reply)
