from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user
from app.admin.schemas.common import PaginatedData, success
from app.admin.services import tracking_admin

from app.models.user import User

router = APIRouter(prefix="/tracking", tags=["数据埋点分析"])

# 时间范围查询参数（前端时间筛选）
RangeParam = Annotated[
    str, Query(alias="range", pattern="^(today|yesterday|7d|30d|custom)$")
]
StartParam = Annotated[str | None, Query(description="custom 起始北京日 YYYY-MM-DD")]
EndParam = Annotated[str | None, Query(description="custom 结束北京日 YYYY-MM-DD")]


@router.get("/overview")
async def tracking_overview(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    range_: RangeParam = "7d",
    start: StartParam = None,
    end: EndParam = None,
):
    """数据概览：核心指标 + 成功率/转化率 + 按天趋势。"""
    return success(data=await tracking_admin.overview(db, range_key=range_, start=start, end=end))


@router.get("/funnel")
async def tracking_funnel(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    range_: RangeParam = "7d",
    start: StartParam = None,
    end: EndParam = None,
):
    """转化漏斗：主流程每步人数 / 转化率 / 流失。"""
    return success(data=await tracking_admin.funnel(db, range_key=range_, start=start, end=end))


@router.get("/creation")
async def tracking_creation(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    range_: RangeParam = "7d",
    start: StartParam = None,
    end: EndParam = None,
):
    """创作分析：创建/生成/导出次数与成功率 + 趋势。"""
    return success(data=await tracking_admin.creation(db, range_key=range_, start=start, end=end))


@router.get("/payment")
async def tracking_payment(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    range_: RangeParam = "7d",
    start: StartParam = None,
    end: EndParam = None,
):
    """支付分析：套餐访问/选择/发起/成功人数 + 成功率/转化率/收入 + 趋势。"""
    return success(data=await tracking_admin.payment(db, range_key=range_, start=start, end=end))


@router.get("/events")
async def tracking_events(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    range_: RangeParam = "7d",
    start: StartParam = None,
    end: EndParam = None,
    event_name: Annotated[str | None, Query()] = None,
    user_id: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    """事件明细：按事件名 / 用户 ID / 时间范围筛选，分页。"""
    items, total = await tracking_admin.list_events(
        db,
        event_name=event_name,
        user_id=user_id,
        range_key=range_,
        start=start,
        end=end,
        page=page,
        page_size=page_size,
    )
    return success(
        data=PaginatedData.create(items=items, total=total, page=page, page_size=page_size).model_dump()
    )
