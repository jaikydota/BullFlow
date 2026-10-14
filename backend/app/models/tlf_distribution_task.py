"""推量发 内容发布任务"""
from __future__ import annotations

from sqlalchemy import BigInteger, Enum, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class TlfDistributionTask(Base, BaseMixin):
    """提交到推量发云端的一次性发布任务。

    一个任务可对应一组同平台账号（platform_code 一致），由推量发异步执行后
    通过 Webhook 推回每个账号的发布结果，sync 到 result_summary。
    """
    __tablename__ = "tlf_distribution_tasks"

    # ── 关联内容 ──
    content_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True,
        comment="关联的 GeneratedContent.id"
    )
    content_snapshot: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="发布时的内容快照（title, type, 摘要）"
    )

    # ── 推量发侧标识 ──
    tlf_operation_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True,
        comment="推量发返回的 operationId（用于轨迹追踪 + Webhook 关联）"
    )
    platform_code: Mapped[str] = mapped_column(
        String(32), nullable=False,
        comment="发布到的平台代码（DouYin / Xhs / …）"
    )

    # ── 目标账号 ──
    target_account_ids: Mapped[list] = mapped_column(
        JSON(none_as_null=True), nullable=False,
        comment="本平台账号本地 ID 数组 [tlf_account.id, ...]"
    )
    account_snapshot: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="账号快照 [{id, platformUserId, platformUserName, avatar}]"
    )

    # ── 状态 ──
    status: Mapped[str] = mapped_column(
        Enum(
            "pending",      # 提交中
            "publishing",   # 推量发已受理，正在分发
            "success",      # 全部账号成功
            "partial",      # 部分成功
            "failed",       # 全部失败
            "cancelled",    # 已取消
            name="tlf_dist_status",
        ),
        nullable=False, server_default="pending",
        comment="任务状态"
    )

    # ── 定时发布 ──
    pre_pub_time: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
        comment="计划发布时间（毫秒级 Unix 时间戳）；NULL = 立即发布"
    )

    # ── 结果 ──
    total_count: Mapped[int] = mapped_column(Integer, server_default="0", comment="目标账号总数")
    success_count: Mapped[int] = mapped_column(Integer, server_default="0", comment="成功数")
    failed_count: Mapped[int] = mapped_column(Integer, server_default="0", comment="失败数")
    result_summary: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="每账号结果 [{accountId, status, workId, errorMessage}]"
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True, comment="任务级错误信息")
