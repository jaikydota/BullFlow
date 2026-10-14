"""子租户 → 稳定社媒账号 多对多映射。

一个稳定账号（[[MediaAccount]] 的 `account_id`/acc_xxx）可被多个子租户绑定；
同一 (app_id, account_id) 不重复。

绑定/鉴权按稳定 `account_id`（acc_xxx）进行；`lapi_account_id` 列仅供历史排查，不作为鉴权键。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from tlf_app.models.base import Base, BaseMixin, UUIDBin16


class TenantAccountBinding(Base, BaseMixin):
    __tablename__ = "tenant_account_bindings"
    __table_args__ = (
        UniqueConstraint("app_id", "lapi_account_id", name="uq_tenant_binding_app_lapi"),
        UniqueConstraint("app_id", "account_id", name="uq_tenant_binding_app_account"),
    )

    app_id: Mapped[str] = mapped_column(
        UUIDBin16, ForeignKey("developer_apps.id", ondelete="CASCADE"), nullable=False, index=True,
        comment="DeveloperApp.id（推量发内部主键，非对外 app_id）",
    )
    account_id: Mapped[str | None] = mapped_column(
        String(40), nullable=True, index=True,
        comment="对外稳定账号 id（MediaAccount.account_id / acc_xxx）—— 鉴权键",
    )
    lapi_account_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True,
        comment="（遗留/过渡）历史底层灵径会话 id，不再作鉴权键，仅保留排查/回滚",
    )
    external_user_id: Mapped[str | None] = mapped_column(
        String(128), nullable=True, index=True,
        comment="发起扫码绑定的子租户终端用户 ID（auth/start 透传）—— 用于代理 IP 粘性："
                "同一用户的多个账号尽量分到同一代理",
    )

    custom_label: Mapped[str | None] = mapped_column(
        String(120), nullable=True,
        comment="该子租户给账号起的别名（可选，对外展示）",
    )
    status: Mapped[str] = mapped_column(
        Enum("active", "unbound", name="binding_status"),
        nullable=False, server_default="active",
        comment="active / unbound（子租户主动解绑）",
    )
    binding_metadata: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="子租户自定义元数据 free-form",
    )
    bound_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="绑定时间")
