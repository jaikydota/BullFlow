from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user
from app.admin.schemas.admin_views import AdminUserListItem
from app.admin.schemas.common import PaginatedData, success
from app.admin.schemas.user_admin import AdminUserCreateBody, AdminUserDetailOut, AdminUserPatchBody
from app.admin.services import user_admin
from app.admin.services.auth_admin import list_users, subscription_summaries

from app.models.user import User

router = APIRouter(prefix="/users", tags=["用户管理"])


@router.get("")
async def list_platform_users(
    _admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: Annotated[str | None, Query()] = None,
    role: Annotated[str | None, Query(description="筛选 super_admin/admin/user")] = None,
):
    rows, total = await list_users(db, page=page, page_size=page_size, search=search, role=role)
    items = [AdminUserListItem.model_validate(u).model_dump() for u in rows]
    # 合并当前 active 套餐摘要（套餐名 / 到期 / 剩余积分）
    summaries = await subscription_summaries(db, [str(u.id) for u in rows])
    for it in items:
        s = summaries.get(str(it["id"]))
        if s:
            it.update(s)
    page_data = PaginatedData.create(
        items=items, total=total, page=page, page_size=page_size
    ).model_dump()
    return success(data=page_data)


@router.post("")
async def admin_create_platform_user(
    body: AdminUserCreateBody,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = await user_admin.create_user_by_admin(
        db, body, actor=admin, operator_id=str(admin.id)
    )
    return success(data={"user": AdminUserDetailOut.model_validate(user).model_dump()})


@router.get("/{user_id}")
async def admin_get_platform_user(
    user_id: str,
    actor: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    u = await user_admin.get_user_detail(db, user_id)
    if actor.role == "admin" and u.role != "user":
        from app.core.exceptions import ForbiddenError

        raise ForbiddenError("仅可查看租户用户")
    return success(data={"user": AdminUserDetailOut.model_validate(u).model_dump()})


@router.patch("/{user_id}")
async def admin_patch_platform_user(
    user_id: str,
    body: AdminUserPatchBody,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = await user_admin.patch_user_by_admin(
        db, user_id, body, actor=admin, operator_id=str(admin.id)
    )
    return success(data={"user": AdminUserDetailOut.model_validate(user).model_dump()})
