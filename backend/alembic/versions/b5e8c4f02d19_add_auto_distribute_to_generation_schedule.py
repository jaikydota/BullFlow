"""add_auto_distribute_to_generation_schedule

Revision ID: b5e8c4f02d19
Revises: a3d7e92f5c81
Create Date: 2026-05-27 10:00:00.000000

「自动生成规则」内置自动分发到国内社媒账号：
- auto_distribute_enabled: 是否启用自动分发
- distribute_platform_code: LAPI 平台代码（DouYin/XiaoHongShu/...）
- distribute_account_ids: LapiAccount.id 数组
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b5e8c4f02d19"
down_revision: Union[str, None] = "a3d7e92f5c81"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "generation_schedules",
        sa.Column(
            "auto_distribute_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="0",
            comment="是否启用自动分发",
        ),
    )
    op.add_column(
        "generation_schedules",
        sa.Column(
            "distribute_platform_code",
            sa.String(50),
            nullable=True,
            comment="LAPI 平台代码（DouYin/XiaoHongShu/...）",
        ),
    )
    op.add_column(
        "generation_schedules",
        sa.Column(
            "distribute_account_ids",
            sa.JSON(),
            nullable=True,
            comment="LapiAccount.id 数组",
        ),
    )


def downgrade() -> None:
    op.drop_column("generation_schedules", "distribute_account_ids")
    op.drop_column("generation_schedules", "distribute_platform_code")
    op.drop_column("generation_schedules", "auto_distribute_enabled")
