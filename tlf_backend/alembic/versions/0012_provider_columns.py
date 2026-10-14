"""media_accounts + publish_tasks: add provider columns（区分灵径/Composio 上游）

Revision ID: 0012_provider_columns
Revises: 0011_proxy_sort_order
Create Date: 2026-06-25 14:00:00.000000

接入 Composio 做海外平台分发：账号/任务需标记上游 provider（lapi 灵径国内 / composio 海外 OAuth）。
- media_accounts.provider（默认 lapi）+ provider_account_ref（composio connection_id）
- publish_tasks.provider（默认 lapi）
纯加列，历史数据默认 lapi（行为不变）。
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_provider_columns"
down_revision: Union[str, Sequence[str], None] = "0011_proxy_sort_order"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "media_accounts",
        sa.Column("provider", sa.String(16), nullable=False, server_default="lapi"),
    )
    op.add_column(
        "media_accounts",
        sa.Column("provider_account_ref", sa.String(128), nullable=True),
    )
    op.add_column(
        "publish_tasks",
        sa.Column("provider", sa.String(16), nullable=False, server_default="lapi"),
    )


def downgrade() -> None:
    op.drop_column("publish_tasks", "provider")
    op.drop_column("media_accounts", "provider_account_ref")
    op.drop_column("media_accounts", "provider")
