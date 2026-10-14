"""media_accounts: add proxy_region（账号选定的代理区域）

Revision ID: 0010_media_proxy_region
Revises: 0009_proxy_platform_block
Create Date: 2026-06-25 10:00:00.000000

终端用户扫码绑定账号时可选代理区域（proxies.region，如『广东-深圳』）。所选 region 落到
该稳定账号上：后续该账号代理故障转移优先同 region 重分配；同一用户下次扫码不传 region 时
默认沿用其名下账号最近一次的 region。纯加列，历史账号该列 NULL（走旧全局分配逻辑）。
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_media_proxy_region"
down_revision: Union[str, Sequence[str], None] = "0009_proxy_platform_block"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("media_accounts", sa.Column("proxy_region", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("media_accounts", "proxy_region")
