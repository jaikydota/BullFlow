"""admin: 全租户发布任务监控。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.database import get_db
from tlf_app.core.dependencies import AdminClaims, get_current_admin
from tlf_app.core.exceptions import NotFoundError
from tlf_app.models.developer_app import DeveloperApp
from tlf_app.models.publish_task import PublishTask
from tlf_app.schemas.common import Page
from tlf_app.schemas.sdk import PublishTaskResponse

router = APIRouter()


@router.get("/publish-tasks", response_model=Page[PublishTaskResponse])
async def list_publish_tasks(
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    app_id_filter: str | None = Query(None, description="按租户 app_id 过滤"),
    status: str | None = Query(None),
    platform_code: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    base = select(PublishTask)
    if app_id_filter:
        app = (await db.execute(
            select(DeveloperApp).where(DeveloperApp.app_id == app_id_filter)
        )).scalar_one_or_none()
        if app is None:
            raise NotFoundError(f"租户不存在 app_id={app_id_filter}")
        base = base.where(PublishTask.app_id == app.id)
    if status:
        base = base.where(PublishTask.status == status)
    if platform_code:
        base = base.where(PublishTask.platform_code == platform_code)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(
        base.order_by(PublishTask.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    return Page[PublishTaskResponse](
        items=[PublishTaskResponse.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )
