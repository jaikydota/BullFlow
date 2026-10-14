from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, BigInteger, Date, DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDBin16, _generate_uuid7


class AnalyticsEvent(Base):
    """埋点原始事件表（全局表，非多租户）。

    与业务表不同：**不继承 BaseMixin**，因为 `user_id` 必须可空以支持匿名访客
    （未登录用户仅有前端生成的 `visitor_id`）。后台「事件明细」读本表，
    每日聚合任务也从本表统计行为类指标。
    """

    __tablename__ = "analytics_events"

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键 UUIDv7（时序）"
    )
    event_name: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True, comment="事件名（见 core/analytics_events.py）"
    )
    user_id: Mapped[str | None] = mapped_column(
        UUIDBin16, nullable=True, index=True, comment="登录用户 ID；匿名访客为空"
    )
    visitor_id: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True, comment="匿名访客 ID（前端生成，持久化于 localStorage）"
    )
    session_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="会话 ID（可选）"
    )
    page_url: Mapped[str | None] = mapped_column(
        String(1024), nullable=True, comment="页面地址"
    )
    referrer: Mapped[str | None] = mapped_column(
        String(1024), nullable=True, comment="来源地址"
    )
    properties: Mapped[dict | None] = mapped_column(
        JSON, nullable=True, comment="事件详情（type / plan_slug / amount / error 等）"
    )
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True, comment="客户端 IP")
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True, comment="User-Agent")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True, comment="发生时间（UTC）"
    )

    __table_args__ = (
        # 聚合任务按 (事件名, 时间) 扫描，复合索引加速
        Index("ix_analytics_events_name_time", "event_name", "created_at"),
    )


class AnalyticsDailyStat(Base):
    """每日核心指标聚合表（按业务自然日 / 北京日）。

    后台概览 / 创作分析 / 支付分析优先读本表（避免每次全量扫原始事件表）。
    由定时任务每日回填；`stat_date` 唯一。
    """

    __tablename__ = "analytics_daily_stats"

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键"
    )
    stat_date: Mapped[date] = mapped_column(
        Date, nullable=False, unique=True, index=True, comment="统计日期（北京自然日）"
    )

    # —— 访问 / 注册 / 登录 ——
    visit_users: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="访问人数（distinct visitor）")
    visit_pv: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="页面访问量 PV")
    register_users: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="注册人数")
    login_users: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="登录人数（distinct user）")

    # —— 创作 / 生成 / 导出 ——
    create_project_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="创建项目数")
    generation_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="生成开始次数")
    generation_success_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="生成成功次数")
    generation_failed_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="生成失败次数")
    export_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="导出开始次数")
    export_success_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="导出成功次数")
    export_failed_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="导出失败次数")

    # —— 付费 ——
    pricing_visit_users: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="套餐页访问人数")
    plan_select_users: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="套餐选择人数")
    pay_start_users: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="支付发起人数")
    pay_success_users: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="支付成功人数")
    pay_failed_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", comment="支付失败次数")
    revenue_cents: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0", comment="收入（分，来自真实订单表）")

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
