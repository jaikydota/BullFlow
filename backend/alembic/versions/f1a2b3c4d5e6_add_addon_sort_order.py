"""增值服务/加包加展示排序字段 sort_order

Revision ID: f1a2b3c4d5e6
Revises: e7b3c9d1a420
Create Date: 2026-06-18

给 saas_addons 加 sort_order（越小越靠前），让加包列表可控制展示顺序、
后加的包能插入已有包之间。套餐已有 tier 排序，加包此前只能按 name/价格排。
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e7b3c9d1a420"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "saas_addons",
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False, comment="展示排序，越小越靠前"),
    )


def downgrade() -> None:
    op.drop_column("saas_addons", "sort_order")
