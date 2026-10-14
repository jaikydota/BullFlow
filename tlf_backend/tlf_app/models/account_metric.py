"""社媒账号指标快照（按账号 + 日期幂等）。"""
from __future__ import annotations

from datetime import date

from sqlalchemy import BigInteger, Date, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from tlf_app.models.base import Base, BaseMixin


class AccountMetric(Base, BaseMixin):
    __tablename__ = "account_metrics"
    __table_args__ = (
        UniqueConstraint("lapi_account_id", "snapshot_date", name="uq_metric_account_date"),
    )

    lapi_account_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, comment="快照日期（按天去重）")

    followers: Mapped[int] = mapped_column(BigInteger, server_default="0")
    works_count: Mapped[int] = mapped_column(BigInteger, server_default="0")
    total_likes: Mapped[int] = mapped_column(BigInteger, server_default="0")
    total_views: Mapped[int] = mapped_column(BigInteger, server_default="0")

    raw: Mapped[dict | None] = mapped_column(JSON(none_as_null=True), nullable=True, comment="原始 payload")
