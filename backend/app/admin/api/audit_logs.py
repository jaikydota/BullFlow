from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user
from app.admin.schemas.common import PaginatedData, success
from app.admin.services import platform_settings_svc

from app.models.user import User

router = APIRouter(prefix="/audit-logs", tags=["操作日志"])


@router.get("")
async def list_audit_logs_api(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: Annotated[str | None, Query()] = None,
):
    rows, total = await platform_settings_svc.list_audit_logs(
        db,
        page=page,
        page_size=page_size,
        search=search,
    )
    return success(
        data=PaginatedData.create(items=rows, total=total, page=page, page_size=page_size).model_dump()
    )
