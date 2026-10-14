from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDBin16, _generate_uuid7


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键，UUID v7"
    )
    user_id: Mapped[str] = mapped_column(
        UUIDBin16, nullable=False, index=True, comment="任务归属用户 ID"
    )
    type: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="任务类型（如 document_parse / image_generate / video_generate 等）"
    )
    status: Mapped[str] = mapped_column(
        Enum("pending", "running", "completed", "failed", "cancelled", name="task_status"),
        server_default="pending",
        comment="任务状态（pending=待执行，running=执行中，completed=已完成，failed=失败，cancelled=已取消）"
    )
    input_params: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="任务输入参数（JSON）"
    )
    result: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="任务执行结果（JSON）"
    )
    error_message: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="失败时的错误信息"
    )
    progress: Mapped[int] = mapped_column(
        Integer, server_default="0", comment="执行进度（0-100）"
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="开始执行时间"
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="完成时间"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )
