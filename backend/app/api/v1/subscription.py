"""我的订阅 API。

- GET /api/v1/subscription/me  → 当前订阅状态 + 4 维度额度
"""
from __future__ import annotations

from datetime import datetime

from app.core.time import utcnow

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import NotFoundError
from app.models.saas import SaasPlan
from app.models.user import User
from app.schemas.common import success
from app.schemas.subscription import QuotaUsage, SubscriptionOut
from app.services import saas_subscription
from app.services.usage_aggregator import (
    get_user_account_count,
    get_user_storage_bytes,
)

router = APIRouter(prefix="/subscription", tags=["订阅 / 计费"])


def _pct(used: int, quota: int) -> float:
    if quota <= 0:
        return 0.0
    return round(min(100.0, used * 100.0 / quota), 2)


def _quota(used: int, quota: int) -> dict:
    return QuotaUsage(
        quota=quota, used=used, remaining=max(0, quota - used), percent=_pct(used, quota)
    ).model_dump()


@router.get("/me")
async def get_my_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 惰性到期：若用户的付费订阅已过期，这里即时降级为永久 Free（不依赖每日定时任务）
    sub = await saas_subscription.lazy_expire_if_due(db, current_user.id)
    if sub is None:
        # 兜底：返回前端友好的"无订阅"信号；正常路径下注册流程已绑 free
        raise NotFoundError("未找到有效订阅，请联系管理员")

    plan_r = await db.execute(select(SaasPlan).where(SaasPlan.slug == sub.plan_slug))
    plan = plan_r.scalar_one_or_none()
    plan_name = plan.name if plan else sub.plan_slug
    features = list((plan.features or []) if plan else [])

    remaining_days = max(0, (sub.expires_at - utcnow()).days)
    # 各配额 = 套餐快照 + 永久加包池（展示合计）
    total_storage_gb = sub.storage_gb_quota + int(sub.addon_storage_gb or 0)
    total_domestic = sub.domestic_accounts_quota + int(sub.addon_domestic_accounts or 0)
    total_overseas = sub.overseas_accounts_quota + int(sub.addon_overseas_accounts or 0)
    storage_quota_bytes = total_storage_gb * 1024 * 1024 * 1024

    # 实时聚合：存储 + 账号数（不依赖易漂移的计数器）
    live_storage = await get_user_storage_bytes(db, current_user.id)
    domestic_used = await get_user_account_count(db, current_user.id, "domestic")
    overseas_used = await get_user_account_count(db, current_user.id, "overseas")

    data = SubscriptionOut(
        plan_slug=sub.plan_slug,
        plan_name=plan_name,
        period=sub.period,
        status=sub.status,
        started_at=sub.started_at,
        expires_at=sub.expires_at,
        remaining_days=remaining_days,
        features=features,
        points=QuotaUsage(**_quota(sub.points_used, sub.points_quota)),
        addon_points=int(sub.addon_points or 0),
        storage_bytes_used=live_storage,
        storage_gb_quota=total_storage_gb,
        storage_percent=_pct(live_storage, storage_quota_bytes) if storage_quota_bytes else 0.0,
        domestic_accounts=QuotaUsage(**_quota(domestic_used, total_domestic)),
        overseas_accounts=QuotaUsage(**_quota(overseas_used, total_overseas)),
        addon_storage_gb=int(sub.addon_storage_gb or 0),
        addon_domestic_accounts=int(sub.addon_domestic_accounts or 0),
        addon_overseas_accounts=int(sub.addon_overseas_accounts or 0),
    ).model_dump(mode="json")
    return success(data=data)
