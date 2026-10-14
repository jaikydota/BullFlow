"""proxies: add sort_order（下发/展示排序权重）

Revision ID: 0011_proxy_sort_order
Revises: 0010_media_proxy_region
Create Date: 2026-06-25 12:00:00.000000

代理下发/展示排序权重，越大越靠前：影响 SDK `GET /proxy/regions` 区域下发顺序
（按区域内最大 sort_order 降序）+ admin 代理列表/区域概览顺序。不改变分配（负载均衡）逻辑。
纯加列，默认 0（历史代理维持原有顺序）。
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_proxy_sort_order"
down_revision: Union[str, Sequence[str], None] = "0010_media_proxy_region"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "proxies",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("proxies", "sort_order")
