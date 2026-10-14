"""推量发管理员认证 service。"""
from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.config import settings
from tlf_app.core.exceptions import AuthenticationError
from tlf_app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from tlf_app.models.admin_user import AdminUser

logger = logging.getLogger(__name__)


async def login(db: AsyncSession, email: str, password: str) -> tuple[str, AdminUser]:
    """校验邮箱 + 密码 → 返回 (access_token, admin_user)。

    错误统一抛 40100，不区分「邮箱不存在」/「密码错」，避免暴力撞库。
    """
    user = (await db.execute(
        select(AdminUser).where(AdminUser.email == email)
    )).scalar_one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        raise AuthenticationError("邮箱或密码错误")
    if user.status != "active":
        raise AuthenticationError("账户已停用")
    token = create_access_token(user.id, extra={"role": user.role, "email": user.email})
    return token, user


async def seed_initial_admin(db: AsyncSession) -> bool:
    """无任何 admin_users 时 seed 第一个 super_admin。返回是否新建。

    在 main.py lifespan 中调用。幂等 —— 表里已有用户就跳过。
    """
    cnt = (await db.execute(select(func.count()).select_from(AdminUser))).scalar_one()
    if cnt > 0:
        return False
    email = settings.TLF_ADMIN_INIT_EMAIL
    password = settings.TLF_ADMIN_INIT_PASSWORD
    user = AdminUser(
        email=email,
        password_hash=hash_password(password),
        name=settings.TLF_ADMIN_INIT_NAME,
        role="super_admin",
        status="active",
    )
    db.add(user)
    await db.flush()
    logger.warning(
        "[tlf-seed] 已 seed 初始超管 email=%s（密码取自 TLF_ADMIN_INIT_PASSWORD），"
        "请尽快登录后改密码！",
        email,
    )
    return True
