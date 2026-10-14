from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import NotFoundError
from app.schemas.common import success
from app.services import notification_service as svc

router = APIRouter(prefix="/notifications", tags=["通知"])


@router.get("")
async def list_notifications(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    type: Annotated[str | None, Query()] = None,
    only_unread: Annotated[bool, Query()] = False,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows, total = await svc.list_for_user(
        db,
        str(current_user.id),
        page=page,
        page_size=page_size,
        type=type,
        only_unread=only_unread,
    )
    return success(
        data={
            "items": [svc.to_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@router.get("/unread-count")
async def get_unread_count(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cnt = await svc.count_unread(db, str(current_user.id))
    return success(data={"count": cnt})


@router.patch("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ok = await svc.mark_read(db, notification_id, str(current_user.id))
    if not ok:
        # 已读过、不存在、或他人通知 — 统一当不存在
        raise NotFoundError("通知不存在或已读")
    await db.commit()  # service 仅执行 UPDATE/DELETE，必须在返回前 commit，否则前端随后拉未读数读到旧值
    return success(data={"id": notification_id})


@router.post("/mark-all-read")
async def mark_all_read(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cnt = await svc.mark_all_read(db, str(current_user.id))
    await db.commit()  # service 仅执行 UPDATE，必须在返回前 commit，否则前端随后拉未读数读到旧值
    return success(data={"updated": cnt})


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ok = await svc.delete_notification(db, notification_id, str(current_user.id))
    if not ok:
        raise NotFoundError("通知不存在")
    await db.commit()  # service 仅 delete，必须在返回前 commit，否则前端随后拉列表读到旧数据
    return success(data={"id": notification_id})
