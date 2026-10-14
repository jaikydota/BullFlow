from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class Notification(Base, BaseMixin):
    """C 端用户站内通知（业务事件自动产生）。"""

    __tablename__ = "notifications"

    type: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True,
        comment="事件类型，如 content.generated / distribution.failed",
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    link_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True,
        comment="点击跳转：站内 /xxx 走 navigate，外站 https:// 走 window.open",
    )
    extra: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="业务上下文：用于幂等去重 key、前端可选展示",
    )
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, index=True,
        comment="已读时间，NULL 表示未读",
    )
