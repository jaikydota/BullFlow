"""proxies: add platform_block（按平台屏蔽，避免单平台封IP误杀整代理）

Revision ID: 0009_proxy_platform_block
Revises: 0008_proxy_upstream_fail
Create Date: 2026-06-17 14:00:00.000000

某平台（如抖音）封了该代理 IP 时，只屏蔽「该代理×该平台」并解绑该平台账号，代理对其它平台仍可用。
platform_block JSON：{platform_code: {fail:int, blocked:bool, reason:str}}。纯加列，默认 NULL。
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_proxy_platform_block"
down_revision: Union[str, Sequence[str], None] = "0008_proxy_upstream_fail"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("proxies", sa.Column("platform_block", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("proxies", "platform_block")
