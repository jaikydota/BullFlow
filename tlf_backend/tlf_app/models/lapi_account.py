"""灵径侧底层社媒账号 = 一次扫码授权产生的「灵径会话」（全局唯一）。

- **`lapi_account_id` 全局唯一**
- 不带 user_id —— 多租户归属通过 TenantAccountBinding 表表达
- `proxy_id` 外键 —— 授权成功时为该账号永久绑定 1 个代理

每条 LapiAccount 隶属一条稳定 [[MediaAccount]]（`media_account_id`）。
同一物理号同时只有 1 条 active 会话用于发布，旧会话标 revoked 保留作别名历史
（老灵径 id → media 的解析依赖这些保留行，见 `services/account_resolver.py`）。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from tlf_app.models.base import Base, BaseMixin, UUIDBin16


class LapiAccount(Base, BaseMixin):
    __tablename__ = "lapi_accounts"

    lapi_account_id: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True,
        comment="灵径返回的账号 ID（全局唯一）",
    )
    media_account_id: Mapped[str | None] = mapped_column(
        UUIDBin16, ForeignKey("media_accounts.id", ondelete="SET NULL"), nullable=True, index=True,
        comment="所属稳定账号 MediaAccount.id（对外稳定 id 的归属）",
    )
    platform_code: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True,
        comment="平台代码（DouYin / XiaoHongShu / ...）",
    )
    platform_user_id: Mapped[str] = mapped_column(
        String(128), nullable=False,
        comment="社媒平台原生用户 ID",
    )
    platform_user_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    platform_avatar: Mapped[str | None] = mapped_column(String(500), nullable=True)

    status: Mapped[str] = mapped_column(
        Enum("active", "expired", "revoked", "orphaned", name="lapi_account_status"),
        nullable=False, server_default="active",
        comment="active / expired / revoked / orphaned（无任何 mapping，待清理）",
    )

    proxy_id: Mapped[str | None] = mapped_column(
        UUIDBin16, ForeignKey("proxies.id", ondelete="SET NULL"), nullable=True, index=True,
        comment="为该账号绑定的代理（授权时分配，永久绑定）",
    )

    last_authed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
