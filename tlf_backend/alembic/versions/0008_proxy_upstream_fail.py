"""proxies: add upstream_fail_count（灵径侧用该代理连续失败计数）

Revision ID: 0008_proxy_upstream_fail
Revises: 0007_proxy_health
Create Date: 2026-06-17 13:00:00.000000

灵径侧通过该代理操作超时/网络异常的连续失败计数；达阈值自动禁用代理并迁移账号。
与本机巡检的 fail_count 分开（本机能连但灵径连不上的代理，靠这个计数发现）。纯加列，默认 0。
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_proxy_upstream_fail"
down_revision: Union[str, Sequence[str], None] = "0007_proxy_health"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("proxies", sa.Column("upstream_fail_count", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("proxies", "upstream_fail_count")
