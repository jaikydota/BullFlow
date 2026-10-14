from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db, require_role
from app.models.user import User
from app.schemas.common import PaginatedData, success
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["用户管理"])


@router.get("")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    search: str | None = Query(None),
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: AsyncSession = Depends(get_db),
):
    svc = UserService(db)
    users, total = await svc.list_users(page=page, page_size=page_size, search=search)
    items = [UserResponse.model_validate(u).model_dump() for u in users]
    return success(data=PaginatedData.create(items=items, total=total, page=page, page_size=page_size).model_dump())


@router.post("")
async def create_user(
    body: UserCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: AsyncSession = Depends(get_db),
):
    svc = UserService(db)
    user = await svc.create_user(body, current_user)
    # 新创建的用户自动绑 Free 订阅（失败不阻塞创建本身）
    try:
        from app.services.saas_subscription import ensure_free_subscription
        await ensure_free_subscription(db, user.id)
    except Exception:
        import logging
        logging.getLogger(__name__).exception("ensure_free_subscription failed user=%s", user.id)
    await db.commit()  # UserService 仅 flush，必须在返回前 commit，否则前端随后拉列表读到旧数据
    return success(data=UserResponse.model_validate(user).model_dump())


@router.get("/{user_id}")
async def get_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = UserService(db)
    user = await svc.get_by_id(user_id)
    if current_user.role == "user" and current_user.id != user_id:
        from app.core.exceptions import ForbiddenError
        raise ForbiddenError("无权查看其他用户信息")
    return success(data=UserResponse.model_validate(user).model_dump())


@router.put("/{user_id}")
async def update_user(
    user_id: str,
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = UserService(db)
    user = await svc.update_user(user_id, body, current_user)
    await db.commit()  # UserService 仅 flush，必须在返回前 commit，否则前端随后拉列表读到旧数据
    return success(data=UserResponse.model_validate(user).model_dump())


@router.delete("/{user_id}")
async def disable_user(
    user_id: str,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: AsyncSession = Depends(get_db),
):
    svc = UserService(db)
    user = await svc.disable_user(user_id, current_user)
    await db.commit()  # UserService 仅 flush，必须在返回前 commit，否则前端随后拉列表读到旧数据
    return success(data=UserResponse.model_validate(user).model_dump(), message="用户已禁用")
