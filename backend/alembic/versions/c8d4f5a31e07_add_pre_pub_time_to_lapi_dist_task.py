"""add pre_pub_time to lapi_distribution_tasks

Revision ID: c8d4f5a31e07
Revises: b5e8c4f02d19
Create Date: 2026-05-28 11:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c8d4f5a31e07"
down_revision: Union[str, Sequence[str], None] = "b5e8c4f02d19"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lapi_distribution_tasks",
        sa.Column(
            "pre_pub_time",
            sa.BigInteger(),
            nullable=True,
            comment="计划发布时间（毫秒级 Unix 时间戳）；NULL = 立即发布",
        ),
    )


def downgrade() -> None:
    op.drop_column("lapi_distribution_tasks", "pre_pub_time")
