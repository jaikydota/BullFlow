from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDBin16, _generate_uuid7


class PlatformSetting(Base):
    """全局键值配置（管理台：通知渠道、营销草稿、流量口令、系统偏好等）。"""

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True, comment="唯一键，如 notification_channels")
    value: Mapped[dict | list | None] = mapped_column(JSON, nullable=True, comment="JSON 结构由前端与 Admin API 约定")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class AdminAuditLog(Base):
    """管理台操作审计（追加写）。"""

    __tablename__ = "admin_audit_logs"

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键"
    )
    operator_id: Mapped[str | None] = mapped_column(
        UUIDBin16,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="操作者 users.id",
    )
    action: Mapped[str] = mapped_column(String(128), nullable=False, comment="如 order.mark_paid")
    resource_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detail: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class TrafficSecretItem(Base):
    """流量密码导流项（运营后台维护，C 端登录用户可见）。"""

    __tablename__ = "traffic_secrets"

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键，UUID v7"
    )
    title: Mapped[str] = mapped_column(String(128), nullable=False, comment="标题")
    icon: Mapped[str | None] = mapped_column(String(16), nullable=True, comment="emoji 字符")
    icon_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="可选图片地址；前端优先于 emoji"
    )
    description: Mapped[str | None] = mapped_column(String(512), nullable=True, comment="一句话描述")
    tags: Mapped[list | None] = mapped_column(JSON, nullable=True, comment="标签数组")
    rating: Mapped[Decimal | None] = mapped_column(
        Numeric(2, 1), nullable=True, comment="星评分 0-5"
    )
    category: Mapped[str | None] = mapped_column(String(64), nullable=True, comment="分类")
    source: Mapped[str | None] = mapped_column(
        String(16), nullable=True, comment="company / partner"
    )
    price_status: Mapped[str | None] = mapped_column(
        String(16), nullable=True, comment="free / trial / subscription / in-app"
    )
    content_markdown: Mapped[str | None] = mapped_column(Text, nullable=True, comment="详情 markdown")
    url: Mapped[str] = mapped_column(String(500), nullable=False, comment="跳转地址")
    sort_order: Mapped[int] = mapped_column(
        Integer, server_default="0", nullable=False, index=True, comment="排序，升序"
    )
    is_enabled: Mapped[bool] = mapped_column(
        Boolean, server_default=true(), nullable=False, index=True, comment="是否启用"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class NotificationBroadcast(Base):
    """运营推送：admin 主动给用户群发的通知元数据。

    每条广播创建时会展开为多条 user-level Notification 行；撤回时按 broadcast_id
    反向删除所有 user notifications。
    """

    __tablename__ = "notification_broadcasts"

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键"
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    link_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    type: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default="admin.broadcast",
        comment="对应展开到 notifications.type",
    )
    target_kind: Mapped[str] = mapped_column(
        String(16), nullable=False, comment="all | users",
    )
    target_user_ids: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="target_kind=users 时记录的 user_id 字符串数组",
    )
    total_count: Mapped[int] = mapped_column(
        Integer, server_default="0", nullable=False,
        comment="推送时计算的实际收件人数",
    )
    operator_id: Mapped[str | None] = mapped_column(
        UUIDBin16,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="操作管理员 users.id",
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, index=True, comment="撤回时间；NULL=有效",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
