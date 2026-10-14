from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user
from app.admin.schemas.common import success
from app.admin.services import platform_settings_svc

from app.models.user import User

router = APIRouter(prefix="/platform-settings", tags=["平台配置"])


@router.get("")
async def get_platform_settings(_a: User = Depends(get_current_admin_user), db: AsyncSession = Depends(get_db)):
    return success(data=await platform_settings_svc.get_all_settings(db))


@router.put("")
async def put_platform_settings(
    body: dict[str, Any],
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(
        data=await platform_settings_svc.update_settings_partial(db, body, str(admin.id))
    )
