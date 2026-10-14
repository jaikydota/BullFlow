"""proxies: add health/last_check_at/last_latency_ms/fail_count（代理连通性健康检查）

Revision ID: 0007_proxy_health
Revises: 0006_media_home_url
Create Date: 2026-06-17 12:00:00.000000

代理周期连通性巡检的健康字段：health(unknown/ok/slow/dead) + 最近探测时间/延迟 + 连续失败计数。
与 admin 手动管理的 status 解耦。纯加列，历史代理 health 默认 unknown（首次巡检后刷新）。
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_proxy_health"
down_revision: Union[str, Sequence[str], None] = "0006_media_home_url"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "proxies",
        sa.Column(
            "health",
            sa.Enum("unknown", "ok", "slow", "dead", name="proxy_health"),
            nullable=False, server_default="unknown",
        ),
    )
    op.add_column("proxies", sa.Column("last_check_at", sa.DateTime(), nullable=True))
    op.add_column("proxies", sa.Column("last_latency_ms", sa.Integer(), nullable=True))
    op.add_column("proxies", sa.Column("fail_count", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("proxies", "fail_count")
    op.drop_column("proxies", "last_latency_ms")
    op.drop_column("proxies", "last_check_at")
    op.drop_column("proxies", "health")
