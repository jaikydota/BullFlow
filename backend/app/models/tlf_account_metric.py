"""推量发账号数据采集快照"""
from __future__ import annotations

from datetime import date

from sqlalchemy import BigInteger, Date, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin, UUIDBin16


class TlfAccountMetric(Base, BaseMixin):
    """账号粒度的每日聚合指标快照。

    每日 cron 触发 + 手动刷新都会写入一行；同一账号同一天若多次刷新，
    以最新值覆盖（由唯一索引保证幂等）。
    """
    __tablename__ = "tlf_account_metrics"
    __table_args__ = (
        UniqueConstraint("tlf_account_id", "snapshot_date", name="uq_tlf_metric_acct_date"),
    )

    tlf_account_id: Mapped[str] = mapped_column(
        UUIDBin16, nullable=False, index=True,
        comment="TlfAccount.id 外键引用（无强约束便于历史保留）"
    )
    snapshot_date: Mapped[date] = mapped_column(
        Date, nullable=False, comment="快照日期（年-月-日）"
    )

    # 通用指标，所有平台共有
    followers: Mapped[int] = mapped_column(BigInteger, server_default="0", comment="粉丝数")
    works_count: Mapped[int] = mapped_column(BigInteger, server_default="0", comment="作品/笔记数")
    total_likes: Mapped[int] = mapped_column(BigInteger, server_default="0", comment="累计点赞数")
    total_views: Mapped[int] = mapped_column(BigInteger, server_default="0", comment="累计播放/浏览数")

    raw: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="推量发返回的原始数据（保留扩展指标）"
    )
