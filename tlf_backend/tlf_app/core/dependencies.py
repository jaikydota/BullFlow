"""FastAPI 依赖注入。

两套鉴权：
1. `get_current_app`：SDK API 用 —— 子租户 Bearer app_key，查 DeveloperApp 表
2. `get_current_admin`：admin API 用 —— **本地 admin_users 表 + 本地 JWT**
   （tlf_backend 自有用户体系）
"""
from __future__ import annotations

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.database import get_db
from tlf_app.core.exceptions import AuthenticationError, ForbiddenError
from tlf_app.core.security import decode_token, verify_secret
from tlf_app.models.admin_user import AdminUser
from tlf_app.models.developer_app import DeveloperApp


_BEARER_PREFIX = "Bearer "


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization or not authorization.startswith(_BEARER_PREFIX):
        return None
    return authorization[len(_BEARER_PREFIX):].strip() or None


async def get_current_app(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> DeveloperApp:
    """SDK 鉴权：`Authorization: Bearer <app_key>` → 查 DeveloperApp。"""
    token = _extract_bearer(authorization)
    if not token:
        raise AuthenticationError("缺少 Authorization Bearer 头")
    stmt = select(DeveloperApp).where(DeveloperApp.status == "active")
    rows = (await db.execute(stmt)).scalars().all()
    for app in rows:
        if verify_secret(token, app.app_key_hash):
            return app
    raise AuthenticationError("app_key 无效或租户已停用")


async def get_current_admin(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> AdminUser:
    """admin API 鉴权：校验本地 JWT + 查本地 admin_users 表 + 校验 status=active。"""
    token = _extract_bearer(authorization)
    if not token:
        raise AuthenticationError("缺少 Authorization Bearer 头")
    try:
        payload = decode_token(token)
    except Exception as exc:
        raise AuthenticationError(f"token 解析失败：{exc}")
    sub = payload.get("sub")
    if not sub:
        raise AuthenticationError("token 缺少 sub")
    user = (await db.execute(select(AdminUser).where(AdminUser.id == sub))).scalar_one_or_none()
    if user is None:
        raise AuthenticationError("用户不存在")
    if user.status != "active":
        raise ForbiddenError("账户已停用")
    return user


# admin 路由依赖的类型别名（即 AdminUser）
AdminClaims = AdminUser
