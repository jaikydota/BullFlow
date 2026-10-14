from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user
from app.admin.schemas.common import success
from app.admin.services import analytics_admin, analytics_content

from app.models.user import User

router = APIRouter(prefix="/analytics", tags=["分析"])


@router.get("/user-registrations")
async def user_registrations(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    months: Annotated[int, Query(ge=1, le=36)] = 12,
):
    return success(data={"series": await analytics_admin.user_registrations_by_month(db, months=months)})


@router.get("/order-status")
async def order_status_breakdown(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data={"by_status": await analytics_admin.orders_by_status(db)})


@router.get("/content-stats")
async def content_stats(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data=await analytics_content.dashboard_style_stats(db))


@router.get("/model-usage-generations")
async def model_usage_generations(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    limit: Annotated[int, Query(ge=1, le=50)] = 15,
):
    return success(data={"items": await analytics_content.model_usage_rank(db, limit=limit)})


@router.get("/generation-daily")
async def generation_daily(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    days: Annotated[int, Query(ge=1, le=90)] = 7,
):
    return success(data={"series": await analytics_content.generations_daily_trend(db, days=days)})


@router.get("/overview")
async def analytics_overview(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    months: Annotated[int, Query(ge=1, le=36)] = 12,
    days: Annotated[int, Query(ge=1, le=90)] = 14,
    model_limit: Annotated[int, Query(ge=1, le=50)] = 10,
):
    """单次返回分析看板常用块，减少前端多次请求；局部统计失败时降级为空/零。"""
    reg = await analytics_admin.user_registrations_by_month(db, months=months)
    orders = await analytics_admin.orders_by_status(db)
    content = await analytics_content.dashboard_style_stats(db)
    models = await analytics_content.model_usage_rank(db, limit=model_limit)
    daily = await analytics_content.generations_daily_trend(db, days=days)
    return success(
        data={
            "user_registrations": {"series": reg},
            "order_status": {"by_status": orders},
            "content_stats": content,
            "model_usage_generations": {"items": models},
            "generation_daily": {"series": daily},
        }
    )
