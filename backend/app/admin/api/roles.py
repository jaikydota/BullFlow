from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user
from app.admin.schemas.common import success
from app.admin.services import console_meta

from app.models.user import User

router = APIRouter(prefix="/roles", tags=["角色矩阵"])


@router.get("/overview")
async def roles_overview_api(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data=await console_meta.roles_overview(db))
