from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class Feedback(Base, BaseMixin):
    """用户建议与反馈。

    用户在前台「意见反馈」页提交文字 + 截图；后台管理系统查看并处理。
    `images` 存可公开访问的完整 URL 列表（来自 /uploads/image）。
    """

    __tablename__ = "feedbacks"

    category: Mapped[str] = mapped_column(
        Enum("suggestion", "bug", "other", name="feedback_category"),
        server_default="suggestion",
        comment="反馈类型（suggestion=建议 / bug=问题 / other=其他）",
    )
    content: Mapped[str] = mapped_column(
        Text, nullable=False, comment="反馈正文"
    )
    images: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="截图 URL 列表（公开访问）"
    )
    contact: Mapped[str | None] = mapped_column(
        String(255), nullable=True, comment="用户留下的联系方式（可选）"
    )
    status: Mapped[str] = mapped_column(
        Enum("pending", "resolved", name="feedback_status"),
        server_default="pending",
        index=True,
        comment="处理状态（pending=待处理 / resolved=已处理）",
    )
    reply: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="管理员回复内容"
    )
    replied_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="回复时间（UTC）"
    )
