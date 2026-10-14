"""发布任务（多租户隔离键为 app_id）。"""
from __future__ import annotations

from sqlalchemy import BigInteger, Enum, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from tlf_app.models.base import Base, BaseMixin, UUIDBin16


class PublishTask(Base, BaseMixin):
    __tablename__ = "publish_tasks"

    app_id: Mapped[str] = mapped_column(
        UUIDBin16, ForeignKey("developer_apps.id", ondelete="CASCADE"), nullable=False, index=True,
        comment="发起任务的子租户",
    )

    # 子租户的关联字段（透传到 webhook callBackData，子租户用来定位自己产品的内容）
    external_content_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="子租户系统内的内容 ID（透传，不解析）",
    )
    content_payload: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="发布内容快照 {title, type, 摘要}",
    )

    # 上游 provider（lapi 灵径 / composio 海外）
    provider: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="lapi",
        comment="本次发布走哪个上游：lapi(灵径) / composio(海外，execute_action 同步返回)",
    )
    # 灵径侧标识
    lapi_operation_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True,
        comment="灵径返回的 operationId（composio 任务留空，结果同步落库）",
    )
    platform_code: Mapped[str] = mapped_column(String(32), nullable=False, comment="目标平台")

    # 目标账号
    target_lapi_account_ids: Mapped[list] = mapped_column(
        JSON(none_as_null=True), nullable=False,
        comment="本次任务的灵径账号 ID 数组",
    )
    account_snapshot: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="账号快照 [{lapiAccountId, subTaskId, platformUserId, ...}]",
    )

    status: Mapped[str] = mapped_column(
        Enum("pending", "publishing", "success", "partial", "failed", "cancelled",
             name="publish_task_status"),
        nullable=False, server_default="pending",
    )

    total_count: Mapped[int] = mapped_column(Integer, server_default="0")
    success_count: Mapped[int] = mapped_column(Integer, server_default="0")
    failed_count: Mapped[int] = mapped_column(Integer, server_default="0")
    result_summary: Mapped[list | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    pre_pub_time: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
        comment="计划发布时间（毫秒级时间戳）；NULL = 立即发布",
    )
