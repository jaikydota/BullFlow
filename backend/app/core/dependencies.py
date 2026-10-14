from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Depends, Header
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.exceptions import AuthenticationError, ForbiddenError, TokenExpiredError
from app.core.redis import get_redis


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_current_user(
    authorization: str = Header(..., description="Bearer <token>"),
    db: AsyncSession = Depends(get_db),
):
    """Extract and validate JWT, return User ORM object."""
    if not authorization.startswith("Bearer "):
        raise AuthenticationError("无效的认证头")

    token = authorization[7:]

    redis = get_redis()
    if await redis.get(f"token:blacklist:{token}"):
        raise TokenExpiredError("Token 已失效")

    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise AuthenticationError("Token 无效或已过期")

    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise AuthenticationError("Token 无效")

    from app.models.user import User
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise AuthenticationError("用户不存在")
    if user.status != "active":
        raise ForbiddenError("用户已被禁用")

    return user


ROLE_HIERARCHY = {"super_admin": 3, "admin": 2, "user": 1}


def require_role(*allowed_roles: str):
    """Return a dependency that checks the user has one of the allowed roles."""

    async def _checker(current_user=Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise ForbiddenError("权限不足")
        return current_user

    return _checker
