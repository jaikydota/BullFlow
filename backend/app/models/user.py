from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDBin16, _generate_uuid7


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键，UUID v7"
    )
    seq_no: Mapped[int | None] = mapped_column(
        Integer, unique=True, nullable=True, default=None, comment="自增序号，用于业务编号展示"
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, comment="登录邮箱，全局唯一"
    )
    phone: Mapped[str | None] = mapped_column(
        String(20), unique=True, nullable=True,
        comment="登录手机号，E.164 格式不含 +（如 8613800138000），全局唯一"
    )
    password_hash: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="密码哈希（bcrypt）"
    )
    nickname: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="显示昵称"
    )
    avatar: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="头像图片 URL"
    )
    role: Mapped[str] = mapped_column(
        Enum("super_admin", "admin", "user", "sales", "finance", name="user_role"),
        nullable=False,
        server_default="user",
        comment="权限角色（super_admin=超级管理员，admin=管理员，user=普通用户，sales=销售，finance=财务）"
    )
    invitation_code: Mapped[str | None] = mapped_column(
        String(32), unique=True, nullable=True, index=True,
        comment="销售员自己的固定引流邀请码；普通用户为 NULL"
    )
    sales_id: Mapped[str | None] = mapped_column(
        UUIDBin16, ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True,
        comment="引流该用户注册的销售用户 ID；销售用户自身为 NULL"
    )
    status: Mapped[str] = mapped_column(
        Enum("active", "disabled", name="user_status"),
        nullable=False,
        server_default="active",
        comment="账号状态（active=正常，disabled=已禁用）"
    )
    language: Mapped[str] = mapped_column(
        String(10), server_default="zh-CN", comment="界面语言偏好（zh-CN / en 等）"
    )
    created_by: Mapped[str | None] = mapped_column(
        UUIDBin16, ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, comment="创建该账号的管理员用户 ID"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="注册时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), comment="最后更新时间"
    )

    @property
    def has_password(self) -> bool:
        """是否设置过登录密码（手机号注册用户初始存空哈希，故为 False）。"""
        return bool(self.password_hash)
