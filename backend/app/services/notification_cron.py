"""通知定时扫描任务：

- scan_expiring_subscriptions: 订阅 7 天内到期 → subscription.expiring_soon
- scan_expiring_tlf_accounts: 推量发账号授权 7 天内到期 → account.expiring_soon

特点：
- 完全幂等。同 user_id + 同 subject 在 7 天内已发过的通知不再重复发。
- 自管 session（不依赖 HTTP 请求事务）。
- 尚未接入启动流程；需要时在 app/main.py 的 lifespan 中通过 APScheduler 定时调用。
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.core.time import utcnow
from app.models.tlf_account import TlfAccount
from app.models.saas import SaasSubscription
from app.services.notification_service import create_notification, has_recent_notification

logger = logging.getLogger(__name__)

EXPIRING_WINDOW_DAYS = 7


async def scan_expiring_subscriptions(db: AsyncSession | None = None) -> int:
    """订阅未来 1-7 天内到期且 active，发"即将到期"提醒。已发过不再发。"""
    own = db is None
    if own:
        sess = async_session_factory()
        db = await sess.__aenter__()
    try:
        now = utcnow()
        window = now + timedelta(days=EXPIRING_WINDOW_DAYS)
        rows = (
            await db.execute(
                select(SaasSubscription).where(
                    SaasSubscription.status == "active",
                    SaasSubscription.plan_slug != "free",
                    SaasSubscription.expires_at > now,
                    SaasSubscription.expires_at <= window,
                )
            )
        ).scalars().all()

        sent = 0
        for sub in rows:
            if await has_recent_notification(
                db,
                user_id=str(sub.user_id),
                type="subscription.expiring_soon",
                extra_key="subscription_id",
                extra_value=str(sub.id),
                within_days=EXPIRING_WINDOW_DAYS,
            ):
                continue
            days_left = max(0, (sub.expires_at - now).days)
            await create_notification(
                db,
                user_id=str(sub.user_id),
                type="subscription.expiring_soon",
                title="套餐即将到期",
                message=f"您的「{sub.plan_slug}」订阅将在 {days_left} 天后到期，及时续费可避免功能受限。",
                link_url="/account/subscription",
                extra={"subscription_id": str(sub.id), "plan_slug": sub.plan_slug},
            )
            sent += 1
        if own:
            await db.commit()
        logger.info("scan_expiring_subscriptions: %d sent", sent)
        return sent
    finally:
        if own:
            await sess.__aexit__(None, None, None)


async def scan_expiring_tlf_accounts(db: AsyncSession | None = None) -> int:
    """推量发账号授权 7 天内过期（active 状态且有 last_authed_at），发提醒。"""
    own = db is None
    if own:
        sess = async_session_factory()
        db = await sess.__aenter__()
    try:
        rows = (
            await db.execute(
                select(TlfAccount).where(TlfAccount.status == "active")
            )
        ).scalars().all()

        # 推量发授权通常 90 天有效；这里按经验"自 last_authed_at 起 83 天后视为即将过期"
        now = utcnow()
        sent = 0
        for acc in rows:
            if not acc.last_authed_at:
                continue
            expires_at = acc.last_authed_at + timedelta(days=90)
            days_left = (expires_at - now).days
            if days_left < 0 or days_left > EXPIRING_WINDOW_DAYS:
                continue
            if await has_recent_notification(
                db,
                user_id=str(acc.user_id),
                type="account.expiring_soon",
                extra_key="tlf_account_id",
                extra_value=str(acc.id),
                within_days=EXPIRING_WINDOW_DAYS,
            ):
                continue
            await create_notification(
                db,
                user_id=str(acc.user_id),
                type="account.expiring_soon",
                title="账号授权即将过期",
                message=f"您的{acc.platform_code}账号「{acc.platform_user_name or acc.platform_user_id}」授权将在 {max(0, days_left)} 天后过期，请重新授权以保证发布不中断。",
                link_url="/tlf/accounts",
                extra={
                    "tlf_account_id": str(acc.id),
                    "platform_code": acc.platform_code,
                },
            )
            sent += 1
        if own:
            await db.commit()
        logger.info("scan_expiring_tlf_accounts: %d sent", sent)
        return sent
    finally:
        if own:
            await sess.__aexit__(None, None, None)
