from __future__ import annotations

from sqlalchemy import Enum, Float, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class CreditTransaction(Base, BaseMixin):
    """积分流水（debit / credit），用户「计费明细」页和审计来源。

    每次扣分（chat/article/image/video/distribution）或加分（注册赠送/订单成单/管理员调整）
    都会写入一行；扣后余额快照存在行内，方便排查与趋势统计。

    `consume_points()` 在事务内写入；失败回滚，保证账实一致。
    """

    __tablename__ = "credit_transactions"
    __table_args__ = (
        Index("idx_credit_tx_user_created", "user_id", "created_at"),
        Index("idx_credit_tx_user_biz", "user_id", "biz_type"),
    )

    direction: Mapped[str] = mapped_column(
        Enum("debit", "credit", name="credit_tx_direction"),
        nullable=False,
        comment="方向：debit=扣分；credit=加分",
    )
    amount: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="积分数（始终正数，direction 决定方向）"
    )
    source: Mapped[str] = mapped_column(
        Enum("subscription", "addon", "mixed", name="credit_tx_source"),
        nullable=False,
        comment="扣自哪个池：subscription=套餐 / addon=增量包 / mixed=跨池",
    )
    biz_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        comment="业务类型：chat / article / image / video / distribution / "
                "grant_subscription / grant_addon / admin_adjust 等",
    )
    biz_ref_type: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="关联资源表名（'chat_message' 等）"
    )
    biz_ref_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="关联资源 ID（UUID 字符串）"
    )
    model_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="AI 模型 ID 快照（如 'doubao-seed-2-0-pro-260215'）"
    )
    unit_price: Mapped[float | None] = mapped_column(
        Float, nullable=True, comment="计费单价快照（元/单位）"
    )
    units: Mapped[float | None] = mapped_column(
        Float, nullable=True, comment="计费数量（tokens / images / seconds / accounts）"
    )
    balance_after_sub: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", comment="本次操作后套餐积分余额"
    )
    balance_after_addon: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", comment="本次操作后增量包积分余额"
    )
    remark: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="备注（人类可读描述）"
    )
