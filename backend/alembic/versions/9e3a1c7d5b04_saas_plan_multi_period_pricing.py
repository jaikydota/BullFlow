"""saas_plans 多周期定价：月/季/年付，订阅 + 订单加 quarter

Revision ID: 9e3a1c7d5b04
Revises: f3a4b5c6d7e8
Create Date: 2026-06-02 10:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9e3a1c7d5b04"
down_revision: Union[str, None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- 1. saas_plans 加多周期定价列 ----
    op.add_column(
        "saas_plans",
        sa.Column("monthly_price_cents", sa.Integer(), server_default="0", nullable=False, comment="月付价（分，必填）"),
    )
    op.add_column(
        "saas_plans",
        sa.Column("quarterly_enabled", sa.Boolean(), server_default="0", nullable=False, comment="是否出售季付"),
    )
    op.add_column(
        "saas_plans",
        sa.Column("quarterly_price_cents", sa.Integer(), nullable=True, comment="季付自定义价（分）；NULL 且启用=月付×3"),
    )
    op.add_column(
        "saas_plans",
        sa.Column("yearly_enabled", sa.Boolean(), server_default="0", nullable=False, comment="是否出售年付"),
    )
    op.add_column(
        "saas_plans",
        sa.Column("yearly_price_cents", sa.Integer(), nullable=True, comment="年付自定义价（分）；NULL 且启用=月付×12"),
    )

    # ---- 2. 历史数据回填 ----
    # 现有套餐均为 period='month'：price_cents 即月付价
    op.execute("UPDATE saas_plans SET monthly_price_cents = price_cents WHERE period = 'month'")
    # 兜底：若有 period='year' 的历史行，把它作为年付价，月付价反推为 1/12
    op.execute(
        """
        UPDATE saas_plans
        SET yearly_enabled = 1,
            yearly_price_cents = price_cents,
            monthly_price_cents = ROUND(price_cents / 12)
        WHERE period = 'year'
        """
    )

    # ---- 3. 删旧单一价 / 周期列 ----
    op.drop_column("saas_plans", "price_cents")
    op.drop_column("saas_plans", "period")

    # ---- 4. saas_subscriptions.period 枚举加 quarter（MySQL inline enum：MODIFY）----
    op.execute(
        "ALTER TABLE saas_subscriptions "
        "MODIFY COLUMN period ENUM('month','quarter','year') NOT NULL COMMENT '计费周期（快照）'"
    )

    # ---- 5. saas_orders 加订阅周期快照 ----
    op.add_column(
        "saas_orders",
        sa.Column(
            "subscription_period",
            sa.Enum("month", "quarter", "year", name="saas_order_subscription_period"),
            nullable=True,
            comment="订阅订单的计费周期快照（支付成功激活时用）",
        ),
    )


def downgrade() -> None:
    op.drop_column("saas_orders", "subscription_period")

    op.execute(
        "ALTER TABLE saas_subscriptions "
        "MODIFY COLUMN period ENUM('month','year') NOT NULL COMMENT '计费周期（快照）'"
    )

    op.add_column(
        "saas_plans",
        sa.Column(
            "period",
            sa.Enum("month", "year", name="saas_plan_period"),
            server_default="month",
            nullable=False,
        ),
    )
    op.add_column(
        "saas_plans",
        sa.Column("price_cents", sa.Integer(), server_default="0", nullable=False, comment="定价（分）"),
    )
    # 还原单一价：用月付价
    op.execute("UPDATE saas_plans SET price_cents = monthly_price_cents")

    op.drop_column("saas_plans", "yearly_price_cents")
    op.drop_column("saas_plans", "yearly_enabled")
    op.drop_column("saas_plans", "quarterly_price_cents")
    op.drop_column("saas_plans", "quarterly_enabled")
    op.drop_column("saas_plans", "monthly_price_cents")
