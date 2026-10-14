"""平台级发布策略（后台可调）。

首期只有一项开关：`allow_links` —— 该平台是否允许发布**含链接**的内容。
动机：X/Twitter 自 2026 年起按次计费，含链接的帖子单价约为普通帖子的 13 倍（≈$0.20 vs $0.015），
需要能在后台一键关掉，避免分发内容里的落地页链接把额度烧光。

表按 platform_code 一行；**没有行 = 默认全部允许**。策略对所有租户生效（网关级），
在 SDK `POST /publish` 受理前校验，命中直接同步返回 40000（不建任务、不产生上游费用）。
"""
from __future__ import annotations

from sqlalchemy import Boolean, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from tlf_app.models.base import Base, BaseMixin


class PlatformPolicy(Base, BaseMixin):
    __tablename__ = "platform_policies"

    platform_code: Mapped[str] = mapped_column(
        String(32), nullable=False, unique=True,
        comment="平台代码（DouYin / Twitter / ...），一平台一行",
    )
    allow_links: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("1"),
        comment="是否允许发布含链接的内容（标题/正文/文章 HTML 里出现 URL 或裸域名即视为含链接）",
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True, comment="备注（如关闭原因）")
