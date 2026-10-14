from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.common import PaginatedData, success
from app.services import referral_service

router = APIRouter(prefix="/referral", tags=["邀请有礼"])


@router.get("/me")
async def my_referral(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """当前用户的邀请码 + 一阶/二阶奖励说明 + 统计（无码则懒生成）。"""
    return success(data=await referral_service.get_overview(db, current_user))


@router.get("/list")
async def my_referral_list(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    """我邀请的用户列表（仅已注册者；含一阶/二阶奖励发放状态）。"""
    items, total = await referral_service.list_referrals(
        db, current_user.id, page=page, page_size=page_size
    )
    return success(
        data=PaginatedData.create(
            items=items, total=total, page=page, page_size=page_size
        ).model_dump()
    )
