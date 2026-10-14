"""增量包生效：订阅加加包池（存储/国内账号/国外账号）+ 订单加 addon 字段

Revision ID: e7b3c9d1a420
Revises: d3f7b1a96e84
Create Date: 2026-06-18

让存储/账号类增量包真正生效：
- saas_subscriptions 新增 addon_storage_gb / addon_domestic_accounts / addon_overseas_accounts
  三个加包池（与套餐配额相加）。注：积分加包 addon_points 永久跟人走；这三个存储/账号加包
  在付费订阅期间有效——升级/续费/降级到付费套餐都保留，仅降级到 Free 或到期失效；
- saas_orders 新增 addon_slug / addon_quantity，记录 value_added（加包）订单买的是什么、几份。
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7b3c9d1a420"
down_revision: Union[str, None] = "d3f7b1a96e84"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "saas_subscriptions",
        sa.Column("addon_storage_gb", sa.Integer(), server_default="0", nullable=False, comment="加包存储（GB），与套餐存储相加；付费订阅期间有效，降级到 Free / 到期后失效"),
    )
    op.add_column(
        "saas_subscriptions",
        sa.Column("addon_domestic_accounts", sa.Integer(), server_default="0", nullable=False, comment="加包国内账号数，与套餐配额相加；付费订阅期间有效，降级到 Free / 到期后失效"),
    )
    op.add_column(
        "saas_subscriptions",
        sa.Column("addon_overseas_accounts", sa.Integer(), server_default="0", nullable=False, comment="加包国外账号数，与套餐配额相加；付费订阅期间有效，降级到 Free / 到期后失效"),
    )
    op.add_column(
        "saas_orders",
        sa.Column("addon_slug", sa.String(length=100), nullable=True, comment="value_added 订单购买的加包 slug"),
    )
    op.add_column(
        "saas_orders",
        sa.Column("addon_quantity", sa.Integer(), nullable=True, comment="value_added 订单购买份数"),
    )


def downgrade() -> None:
    op.drop_column("saas_orders", "addon_quantity")
    op.drop_column("saas_orders", "addon_slug")
    op.drop_column("saas_subscriptions", "addon_overseas_accounts")
    op.drop_column("saas_subscriptions", "addon_domestic_accounts")
    op.drop_column("saas_subscriptions", "addon_storage_gb")
