from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class GenerationSchedule(Base, BaseMixin):
    """自动内容生成调度规则

    每条规则对应一种内容类型（文章/图片/视频），在指定 cron 时间自动触发生成，
    结果写入 generated_contents 表。
    """

    __tablename__ = "generation_schedules"

    name: Mapped[str] = mapped_column(
        String(200), nullable=False, comment="规则名称，如「每日小红书文章」"
    )
    type: Mapped[str] = mapped_column(
        String(20), nullable=False, comment="内容类型：article / image / video"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, server_default="1", nullable=False, comment="是否启用"
    )

    # ── 调度时间 ──
    cron_hour: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="触发小时（0-23，本地时区）"
    )
    cron_minute: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", comment="触发分钟（0-59）"
    )
    cron_days_of_week: Mapped[str | None] = mapped_column(
        String(20), nullable=True,
        comment="触发星期，null=每天; '0'=周一; '0,2,4'=周一三五（APScheduler 0=Monday）"
    )
    timezone: Mapped[str] = mapped_column(
        String(60), nullable=False, server_default="'Asia/Shanghai'", comment="时区"
    )

    # ── 生成配置（统一进一个 JSON，对齐三个生成页的请求体；由前端 GenerationConfigPanel 序列化）──
    gen_config: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment=(
            "生成配置：{prompt, reference, skill_id, template_label, provider, model, "
            "mixed(文章) / size,count,as_dynamic,image_urls(图片) / "
            "resolution,duration,enable_audio,image_url,last_image_url(视频)}"
        ),
    )

    # ── 自动分发（生成完成后内置发到国内社媒）──
    auto_distribute_enabled: Mapped[bool] = mapped_column(
        Boolean, server_default="0", nullable=False, comment="是否启用自动分发"
    )
    distribute_platform_code: Mapped[str | None] = mapped_column(
        String(50), nullable=True,
        comment="TLF 平台代码（DouYin / XiaoHongShu / ...）；启用分发时必填",
    )
    distribute_account_ids: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="TlfAccount.id 数组；启用分发时必填且非空（旧单平台字段，保留兼容；多平台见 distribute_config）",
    )
    distribute_config: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment=(
            "完整分发配置（对齐配置发布）："
            "{platforms:[code], accounts:{code:[accId]}, "
            "extras:{code:{visible_type/statement/create_type/category/sub_category}}}。"
            "extras 由前端 computePerPlatformBatchExtras + 分类解析后存入，后端原样透传 + 补 tags。"
        ),
    )

    # ── 执行统计 ──
    last_run_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="上次触发时间"
    )
    next_run_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="下次预计触发时间"
    )
    run_count: Mapped[int] = mapped_column(
        Integer, server_default="0", nullable=False, comment="累计触发次数"
    )
    last_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="上次执行状态：success / failed"
    )
    last_error: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="上次失败时的错误信息"
    )
