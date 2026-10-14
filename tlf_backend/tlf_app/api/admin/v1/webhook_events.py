"""admin: webhook 事件日志 + 死信重发。"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.database import get_db
from tlf_app.core.dependencies import AdminClaims, get_current_admin
from tlf_app.core.exceptions import NotFoundError
from tlf_app.models.webhook_event import WebhookEvent
from tlf_app.schemas.admin import WebhookEventAdminResponse
from tlf_app.schemas.common import Page, ok
from tlf_app.services.webhook_forward import forward_event

router = APIRouter()


@router.get("/webhook-events", response_model=Page[WebhookEventAdminResponse])
async def list_events(
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    forward_status: str | None = Query(None),
    event_type: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    base = select(WebhookEvent)
    if forward_status:
        base = base.where(WebhookEvent.forward_status == forward_status)
    if event_type:
        base = base.where(WebhookEvent.lapi_event_type == event_type)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(
        base.order_by(WebhookEvent.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    return Page[WebhookEventAdminResponse](
        items=[WebhookEventAdminResponse.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/webhook-events/{event_id}")
async def get_event_detail(
    event_id: str,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """返回完整 raw_payload 用于排障。"""
    event = (await db.execute(
        select(WebhookEvent).where(WebhookEvent.id == event_id)
    )).scalar_one_or_none()
    if event is None:
        raise NotFoundError("事件不存在")
    return ok({
        "id": event.id,
        "app_id": event.app_id,
        "lapi_event_type": event.lapi_event_type,
        "raw_payload": event.raw_payload,
        "raw_body_text": event.raw_body_text,
        "forward_status": event.forward_status,
        "forward_attempts": event.forward_attempts,
        "last_error": event.last_error,
        "created_at": event.created_at,
    })


@router.post("/webhook-events/{event_id}/retry")
async def retry_event(
    event_id: str,
    background_tasks: BackgroundTasks,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    event = (await db.execute(
        select(WebhookEvent).where(WebhookEvent.id == event_id)
    )).scalar_one_or_none()
    if event is None:
        raise NotFoundError("事件不存在")
    # 重置状态后异步重发
    event.forward_status = "pending"
    event.last_error = None
    # 必须 commit：forward_event 在独立 session 跑，否则读不到 pending 状态（CLAUDE.md §9.1.1）
    await db.commit()
    background_tasks.add_task(forward_event, event.id)
    return ok({"queued": True})
