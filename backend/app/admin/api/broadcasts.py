from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user
from app.admin.schemas.broadcast import BroadcastCreate
from app.admin.schemas.common import success
from app.admin.services import broadcast_svc

from app.models.user import User

router = APIRouter(prefix="/broadcasts", tags=["消息推送"])


@router.get("")
async def list_broadcasts_api(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    items, total = await broadcast_svc.list_broadcasts(db, page=page, page_size=page_size)
    return success(data={"items": items, "total": total, "page": page, "page_size": page_size})


@router.post("")
async def create_broadcast_api(
    body: BroadcastCreate,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(
        data={
            "item": await broadcast_svc.create_broadcast(
                db, body, operator_id=str(admin.id)
            )
        }
    )


@router.delete("/{broadcast_id}")
async def revoke_broadcast_api(
    broadcast_id: str,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(
        data={
            "item": await broadcast_svc.revoke_broadcast(
                db, broadcast_id, operator_id=str(admin.id)
            )
        }
    )
