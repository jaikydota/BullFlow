from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.schemas.common import success
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["仪表盘"])


@router.get("/stats")
async def get_dashboard_stats(
    recent_limit: Annotated[int, Query(ge=1, le=20)] = 5,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """聚合接口：5 类资产 count + 最近 N 篇文档。一次请求填满整个仪表盘。"""
    user_id = str(current_user.id)
    stats = await dashboard_service.get_stats(db, user_id)
    recent = await dashboard_service.get_recent_documents(db, user_id, limit=recent_limit)
    return success(data={**stats, "recentDocuments": recent})


@router.get("/analytics")
async def get_dashboard_analytics(
    days: Annotated[int, Query(ge=7, le=90)] = 30,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """数据仪表板：上传 / 创作 / 发布 / 对话 / 社媒账号 多维度统计（趋势 + 分布）。"""
    data = await dashboard_service.get_analytics(db, str(current_user.id), days=days)
    return success(data=data)
