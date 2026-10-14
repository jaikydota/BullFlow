"""Webhook 事件归档 + 转发状态。

每条 webhook：从灵径接收 → 落库 → 异步转发到子租户 webhook URL。死信由 admin 后台手动重发。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from tlf_app.models.base import Base, BaseMixin, UUIDBin16


class WebhookEvent(Base, BaseMixin):
    __tablename__ = "webhook_events"

    app_id: Mapped[str | None] = mapped_column(
        UUIDBin16, ForeignKey("developer_apps.id", ondelete="SET NULL"),
        nullable=True, index=True,
        comment="事件归属租户（按 callBackData.app_id 解析；不可解析则 NULL）",
    )

    lapi_event_type: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True,
        comment="灵径事件类型：authResult / publishResult / publishProcess / auditStatus / accountStatus / accountOverview",
    )
    raw_payload: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="原始 webhook body（JSON）",
    )
    raw_body_text: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="原始 body 文本（重发时按原样发；不存到 raw_payload 是为了保留字节级一致）",
    )

    signature_ok: Mapped[bool] = mapped_column(
        Integer, server_default="0", nullable=False, comment="灵径侧 webhook 签名校验是否通过",
    )

    forward_status: Mapped[str] = mapped_column(
        Enum("pending", "ok", "failed", "dead", "skipped", name="webhook_forward_status"),
        nullable=False, server_default="pending",
        comment="转发状态：pending / ok / failed(重试中) / dead(放弃) / skipped(未配置 webhook_url)",
    )
    forward_attempts: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    forwarded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
