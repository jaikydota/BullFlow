"""订单状态加 reviewing（对公转账待核销）

Revision ID: b4d6f8a0c2e1
Revises: c3d5e7f9b2e4
Create Date: 2026-06-18

对公转账流程：用户下单(pending) → 提交核销(reviewing) → 财务通过(paid)/驳回(退回 pending)。
给 saas_orders.status 枚举加 reviewing。
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b4d6f8a0c2e1"
down_revision: Union[str, None] = "c3d5e7f9b2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_OLD = sa.Enum("pending", "paid", "cancelled", "refunded", name="saas_order_status")
_NEW = sa.Enum("pending", "reviewing", "paid", "cancelled", "refunded", name="saas_order_status")


def upgrade() -> None:
    op.alter_column(
        "saas_orders",
        "status",
        existing_type=_OLD,
        type_=_NEW,
        existing_nullable=False,
        existing_server_default="pending",
    )


def downgrade() -> None:
    # 回滚前把 reviewing 归并为 pending，避免枚举收窄报错
    op.execute("UPDATE saas_orders SET status='pending' WHERE status='reviewing'")
    op.alter_column(
        "saas_orders",
        "status",
        existing_type=_NEW,
        type_=_OLD,
        existing_nullable=False,
        existing_server_default="pending",
    )
