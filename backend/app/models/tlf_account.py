"""推量发 已授权社媒账号"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class TlfAccount(Base, BaseMixin):
    """通过推量发云端授权的社媒账号

    一个 user_id 在同一 platform 下不能重复绑定同一 platformUserId。
    """
    __tablename__ = "tlf_accounts"
    __table_args__ = (
        UniqueConstraint("user_id", "platform_code", "platform_user_id", name="uq_tlf_account_user_plat"),
    )

    # ── 推量发侧标识 ──
    tlf_account_id: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True,
        comment="推量发稳定账号 ID（acc_xxx，对外不透明、永不变；来自 webhook data.id）。"
                "历史数据可能仍是旧灵径会话 id，网关侧别名解析兼容，下次扫码/同步会自动刷新为 acc_xxx。"
    )
    platform_code: Mapped[str] = mapped_column(
        String(32), nullable=False,
        comment="平台代码（DouYin / Xhs / WxVideo / Bili / Kuaishou …）"
    )

    # ── 平台账号信息（来自授权回调） ──
    platform_user_id: Mapped[str] = mapped_column(
        String(128), nullable=False,
        comment="社媒平台原生用户 ID（如抖音 user_id）"
    )
    platform_user_name: Mapped[str | None] = mapped_column(
        String(200), nullable=True, comment="社媒平台展示名"
    )
    platform_avatar: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="头像 URL（Text：海外平台如 Instagram 头像 URL 可超 500 字符）"
    )
    platform_home_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True,
        comment="主页 URL：能拼出用户主页则为用户主页，否则为平台站点首页（推量发网关已兜底，下游直接用）"
    )
    home_url_is_profile: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True,
        comment="platform_home_url 是否为用户个人主页：True=用户主页 / False=平台站点首页（网关兜底结果）"
    )

    # ── 状态 ──
    status: Mapped[str] = mapped_column(
        Enum("active", "expired", "revoked", name="tlf_account_status"),
        nullable=False, server_default="active",
        comment="账号状态：active=可用 / expired=登录态过期 / revoked=已撤销"
    )

    last_authed_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="最近一次授权成功时间"
    )
    last_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="最近一次主动同步状态时间"
    )
