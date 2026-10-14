from __future__ import annotations

from fastapi import Depends, Header
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import AuthenticationError, ForbiddenError
from app.models.user import User

_ADMIN_ROLES = frozenset({"super_admin", "admin"})


async def get_current_admin_user(
    authorization: str = Header(..., description="Bearer <token>"),
    db: AsyncSession = Depends(get_db),
):
    """Validate JWT and require platform admin role (same `users` table as business backend)."""
    if not authorization.startswith("Bearer "):
        raise AuthenticationError("无效的认证头")

    token = authorization[7:]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise AuthenticationError("Token 无效或已过期")

    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise AuthenticationError("Token 无效")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise AuthenticationError("用户不存在")
    if user.status != "active":
        raise ForbiddenError("用户已被禁用")
    if user.role not in _ADMIN_ROLES:
        raise ForbiddenError("需要管理员角色")

    return user


async def get_current_super_admin(user: User = Depends(get_current_admin_user)) -> User:
    """仅允许 super_admin 修改计费总配置等高敏操作。"""
    if user.role != "super_admin":
        raise ForbiddenError("需要超级管理员")
    return user


_CONSOLE_ROLES = frozenset({"super_admin", "admin", "sales", "finance"})


async def get_current_console_user(
    authorization: str = Header(..., description="Bearer <token>"),
    db: AsyncSession = Depends(get_db),
) -> User:
    """可登录后台控制台的用户：管理员 + 销售（销售仅能访问自己的看板接口）。"""
    if not authorization.startswith("Bearer "):
        raise AuthenticationError("无效的认证头")
    token = authorization[7:]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise AuthenticationError("Token 无效或已过期")
    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise AuthenticationError("Token 无效")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise AuthenticationError("用户不存在")
    if user.status != "active":
        raise ForbiddenError("用户已被禁用")
    if user.role not in _CONSOLE_ROLES:
        raise ForbiddenError("无权访问管理后台")
    return user


async def get_current_sales_user(user: User = Depends(get_current_console_user)) -> User:
    """仅销售本人：用于销售自助看板接口。"""
    if user.role != "sales":
        raise ForbiddenError("需要销售角色")
    return user


_FINANCE_ROLES = frozenset({"super_admin", "admin", "finance"})


async def get_current_finance_user(user: User = Depends(get_current_console_user)) -> User:
    """订单核销 + 财务报表：财务 / 管理员可访问。"""
    if user.role not in _FINANCE_ROLES:
        raise ForbiddenError("需要财务或管理员角色")
    return user
