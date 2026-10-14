"""推量发后台管理员账户（独立 user 表）。

设计原则：tlf_backend 自我闭环 —— 自己的用户、自己的 JWT。
首次启动通过 lifespan 从 .env 读取 TLF_ADMIN_INIT_EMAIL/PASSWORD 自动 seed
一个 super_admin，避免「先 SQL 插入再登录」的鸡生蛋。
"""
from __future__ import annotations

from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from tlf_app.models.base import Base, BaseMixin


class AdminUser(Base, BaseMixin):
    __tablename__ = "admin_users"

    email: Mapped[str] = mapped_column(
        String(190), nullable=False, unique=True, index=True,
        comment="登录邮箱（唯一）",
    )
    password_hash: Mapped[str] = mapped_column(
        String(128), nullable=False, comment="bcrypt 哈希",
    )
    name: Mapped[str | None] = mapped_column(String(120), nullable=True, comment="显示名")
    role: Mapped[str] = mapped_column(
        Enum("super_admin", "admin", name="tlf_admin_role"),
        nullable=False, server_default="admin",
        comment="角色：super_admin / admin",
    )
    status: Mapped[str] = mapped_column(
        Enum("active", "disabled", name="tlf_admin_status"),
        nullable=False, server_default="active",
        comment="状态：active / disabled",
    )
