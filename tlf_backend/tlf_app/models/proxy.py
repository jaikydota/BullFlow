"""代理池。

- 统一由 admin 管理，不按用户分配
- 分配主体为灵径账号（见 LapiAccount.proxy_id）
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from tlf_app.models.base import Base, BaseMixin


class Proxy(Base, BaseMixin):
    __tablename__ = "proxies"

    name: Mapped[str] = mapped_column(String(120), nullable=False, comment="节点名（如 广州-100M）")
    region: Mapped[str | None] = mapped_column(String(64), nullable=True, comment="地区")
    server_add: Mapped[str] = mapped_column(String(255), nullable=False, comment="IP / 域名")
    server_port: Mapped[int] = mapped_column(Integer, nullable=False, comment="端口")
    proxy_type: Mapped[str] = mapped_column(
        Enum("socks5", "http", name="proxy_type"),
        nullable=False, server_default="socks5",
        comment="代理类型",
    )
    user_name: Mapped[str | None] = mapped_column(String(120), nullable=True, comment="用户名（可选）")
    password: Mapped[str | None] = mapped_column(String(255), nullable=True, comment="密码（可选；不脱敏不入日志）")
    max_users: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="容量；NULL=取系统默认 50")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="过期时间；NULL=永久")
    status: Mapped[str] = mapped_column(
        Enum("active", "expired", "disabled", name="proxy_status"),
        nullable=False, server_default="active",
        comment="管理状态（admin 手动管理）：active / expired / disabled",
    )
    # ── 连通性健康（周期探测自动维护，与 admin 的 status 解耦） ──
    health: Mapped[str] = mapped_column(
        Enum("unknown", "ok", "slow", "dead", name="proxy_health"),
        nullable=False, server_default="unknown",
        comment="实测连通性：unknown 未测 / ok 正常 / slow 出口慢 / dead 连续不通",
    )
    last_check_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="最近一次连通性探测时间"
    )
    last_latency_ms: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="最近一次出口延迟（ms）；TCP 不通为空"
    )
    fail_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", comment="本机巡检连续失败次数（成功清零）"
    )
    upstream_fail_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0",
        comment="灵径侧用该代理失败总次数（信息用；按平台屏蔽见 platform_block）",
    )
    platform_block: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="按平台屏蔽：{platform_code: {fail:int, blocked:bool, reason:str}}。"
                "某平台（如抖音）封了该代理IP时，只屏蔽该平台、解绑该平台账号，代理对其它平台仍可用",
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0",
        comment="下发/展示排序权重：越大越靠前。影响 SDK 区域下发顺序 + admin 列表/概览顺序，不改分配逻辑",
    )
    # 采购管理信息
    order_no: Mapped[str | None] = mapped_column(String(64), nullable=True, comment="采购订单号")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True, comment="备注")
