"""灵径「按账号同步操作」(取分类/概览/风控/发布等)的统一错误副作用处理。

用法：
    async with lapi_account_op(db, media.current_lapi_account_id):
        data = await lapi_client.get_publish_risk_status(...)

捕获 LapiBusinessError 后按错误类型做副作用，然后**原样重抛**（不吞错，调用方/前端仍收到错误）：
- 登录态失效 → 账号置 expired（引导用户重新扫码）；
- 代理异常（Socks5 认证失败等）→ 禁用该代理 + 解绑其上所有账号（下次自动改分到健康代理）。
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.services import lapi_client
from tlf_app.services.account_ops import mark_session_expired
from tlf_app.services.proxy_service import (
    disable_proxy_for_account,
    note_account_proxy_failure,
    reset_account_proxy_failures,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lapi_account_op(db: AsyncSession, lapi_account_id: str | None, *, proxy_op: bool = False):
    """包裹灵径按账号同步操作，按错误类型做副作用后**原样重抛**。

    proxy_op=True 表示该操作带账号代理（发布/概览/风控）：网络超时/异常会累计「灵径侧代理失败」，
    达阈值自动禁用代理+迁移；灵径侧成功则清零该计数。取分类不带代理，用默认 False。
    """
    try:
        yield
    except lapi_client.LapiBusinessError as exc:
        if lapi_account_id:
            try:
                if lapi_client.is_login_expired(exc):
                    await mark_session_expired(db, lapi_account_id)
                    await db.commit()
                elif lapi_client.is_proxy_error(exc):
                    await disable_proxy_for_account(
                        db, lapi_account_id,
                        reason=getattr(exc, "lapi_message", "") or str(exc),
                    )
                    await db.commit()
            except Exception as side_exc:  # noqa: BLE001 — 副作用失败不掩盖原始错误
                logger.warning("[lapi-op] 处理 %s 业务错误副作用失败：%s", lapi_account_id, side_exc)
                try:
                    await db.rollback()
                except Exception:  # noqa: BLE001
                    pass
        raise
    except lapi_client.LapiGatewayError as exc:
        # 网络/超时：代理型操作记一次「灵径侧代理失败」，连续达阈值则禁用代理+迁移
        if proxy_op and lapi_account_id:
            try:
                await note_account_proxy_failure(
                    db, lapi_account_id, reason=getattr(exc, "message", "") or str(exc),
                )
                await db.commit()
            except Exception as side_exc:  # noqa: BLE001
                logger.warning("[lapi-op] 处理 %s 网络错误副作用失败：%s", lapi_account_id, side_exc)
                try:
                    await db.rollback()
                except Exception:  # noqa: BLE001
                    pass
        raise
    else:
        # 灵径侧成功 → 清零该代理的连续失败计数（保持「连续」语义）；交由 get_db 收尾 commit
        if proxy_op and lapi_account_id:
            try:
                await reset_account_proxy_failures(db, lapi_account_id)
            except Exception as side_exc:  # noqa: BLE001
                logger.debug("[lapi-op] 清零 %s 代理失败计数失败：%s", lapi_account_id, side_exc)
