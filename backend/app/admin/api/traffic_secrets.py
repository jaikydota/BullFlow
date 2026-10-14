from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user
from app.admin.schemas.common import success
from app.admin.schemas.traffic_secret import TrafficSecretCreate, TrafficSecretUpdate
from app.admin.services import traffic_secrets_svc

from app.models.user import User

router = APIRouter(prefix="/traffic-secrets", tags=["流量密码"])


@router.get("")
async def list_traffic_secrets(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data={"items": await traffic_secrets_svc.list_items(db)})


@router.post("")
async def create_traffic_secret(
    body: TrafficSecretCreate,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(
        data={
            "item": await traffic_secrets_svc.create_item(
                db, body, operator_id=str(admin.id)
            )
        }
    )


@router.put("/{item_id}")
async def update_traffic_secret(
    item_id: str,
    body: TrafficSecretUpdate,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(
        data={
            "item": await traffic_secrets_svc.update_item(
                db, item_id, body, operator_id=str(admin.id)
            )
        }
    )


@router.patch("/{item_id}/status")
async def toggle_traffic_secret(
    item_id: str,
    enabled: Annotated[bool, Query()],
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(
        data={
            "item": await traffic_secrets_svc.toggle_item(
                db, item_id, enabled, operator_id=str(admin.id)
            )
        }
    )


@router.delete("/{item_id}")
async def delete_traffic_secret(
    item_id: str,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    await traffic_secrets_svc.delete_item(db, item_id, operator_id=str(admin.id))
    return success(data={"id": item_id})
