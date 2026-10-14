"""稳定社媒账号（对外抽象层）。

一个物理社媒号（platform_code + platform_user_id）= 一条 MediaAccount，对外暴露稳定
不透明 id `account_id`（acc_xxx），**永不变**。底层灵径每次扫码新建的会话（LapiAccount）
挂在它下面：同一时刻只保留 1 条 active 会话（最新扫码那条）用于发布，旧会话灵径侧 revoke
省钱、本地标 revoked 保留作别名历史。

设计动机：租户只持有 acc_xxx、永远不接触会变化/会被删的灵径会话 id，网关因此可自由
revoke/切换底层灵径会话而不影响任何租户——既根治「租户存了被删灵径 id → 403」，又避免
同一物理号在灵径侧产生多条持续扣费的重复账号。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from tlf_app.models.base import Base, BaseMixin


class MediaAccount(Base, BaseMixin):
    __tablename__ = "media_accounts"
    __table_args__ = (
        UniqueConstraint("platform_code", "platform_user_id", name="uq_media_platform_user"),
    )

    account_id: Mapped[str] = mapped_column(
        String(40), nullable=False, unique=True, index=True,
        comment="对外稳定账号 id（acc_xxx，不透明，永不变）",
    )
    platform_code: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True,
        comment="平台代码（DouYin / XiaoHongShu / ...）",
    )
    platform_user_id: Mapped[str] = mapped_column(
        String(128), nullable=False,
        comment="社媒平台原生用户 ID（与 platform_code 一起唯一标识一个物理号）",
    )
    platform_user_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Text：海外平台（如 Instagram CDN）头像 URL 可超 500 字符
    platform_avatar: Mapped[str | None] = mapped_column(Text, nullable=True)
    platform_home_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True,
        comment="主页 URL：能拼出用户主页则为用户主页，否则退平台站点首页（兜底在网关内完成，下游不再兜底）",
    )
    home_url_is_profile: Mapped[bool | None] = mapped_column(
        nullable=True,
        comment="platform_home_url 是否为用户个人主页：True=用户主页 / False=平台站点首页（拼不出用户主页时的兜底）",
    )
    proxy_region: Mapped[str | None] = mapped_column(
        String(64), nullable=True,
        comment="该账号选定的代理区域（如『广东-深圳』）：授权时由终端用户选/继承其上次选择；"
                "代理故障转移时优先在同 region 内重分配。NULL=未指定（走旧全局分配逻辑）",
    )
    # ── 上游 provider（国内灵径 vs 海外 Composio）──
    provider: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="lapi",
        comment="账号上游：lapi(灵径/国内扫码+代理) / composio(海外 OAuth，无代理无会话)",
    )
    provider_account_ref: Mapped[str | None] = mapped_column(
        String(128), nullable=True,
        comment="provider 侧账号引用：composio connection_id（lapi 账号留空，会话走 current_lapi_account_id）",
    )

    status: Mapped[str] = mapped_column(
        Enum("active", "expired", "revoked", name="media_account_status"),
        nullable=False, server_default="active",
        comment="当前底层会话状态投影：active / expired / revoked",
    )

    current_lapi_account_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True,
        comment="当前用于发布/同步的底层灵径会话 id（LapiAccount.lapi_account_id）",
    )

    last_authed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True,
        comment="最近一次被租户「使用」的时间（发布/取分类/风控操作）。不含登录态轮询检查与触发指标采集"
                "（下游定时任务常态，计入会每日续命）——与 last_authed_at 一起作为「不活跃自动回收」判定依据",
    )
