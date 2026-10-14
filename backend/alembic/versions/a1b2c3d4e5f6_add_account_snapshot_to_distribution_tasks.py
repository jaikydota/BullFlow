"""add account_snapshot to distribution_tasks

Revision ID: a1b2c3d4e5f6
Revises: fef6188fbb63
Create Date: 2026-04-29
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "fef6188fbb63"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "distribution_tasks",
        sa.Column("account_snapshot", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("distribution_tasks", "account_snapshot")
