"""开发者子租户（推量发的接入方）。

每个接入方产品 = 一个 DeveloperApp 行，持有自己的 app_id / app_key / webhook URL。
"""
from __future__ import annotations

from sqlalchemy import Enum, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from tlf_app.models.base import Base, BaseMixin


class DeveloperApp(Base, BaseMixin):
    __tablename__ = "developer_apps"

    name: Mapped[str] = mapped_column(String(120), nullable=False, comment="产品名（如 matrix365）")
    app_id: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, comment="对外可见的子租户标识 app_xxx"
    )
    app_key_hash: Mapped[str] = mapped_column(
        String(128), nullable=False, comment="app_key 的 bcrypt 哈希（明文仅创建/重置时展示一次）"
    )
    webhook_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="子租户接收 webhook 的回调地址（HTTPS）"
    )
    webhook_secret: Mapped[str] = mapped_column(
        String(128), nullable=False, comment="转发 webhook 时用的 HMAC 秘钥（hex，明文存以便重签）"
    )
    status: Mapped[str] = mapped_column(
        Enum("active", "disabled", name="developer_app_status"),
        nullable=False, server_default="active",
        comment="状态：active / disabled（软删除）",
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True, comment="备注")
    created_by_admin_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="创建者 admin 用户 ID（来自 JWT.sub）"
    )
