"""add_notification_broadcasts_table

Revision ID: e9b1c4a82367
Revises: d5a8c2e07491
Create Date: 2026-05-22 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e9b1c4a82367"
down_revision: Union[str, None] = "d5a8c2e07491"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notification_broadcasts",
        sa.Column("id", sa.BINARY(16), primary_key=True, comment="主键"),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("link_url", sa.String(500), nullable=True),
        sa.Column(
            "type",
            sa.String(64),
            nullable=False,
            server_default="admin.broadcast",
        ),
        sa.Column("target_kind", sa.String(16), nullable=False, comment="all | users"),
        sa.Column("target_user_ids", sa.JSON(), nullable=True),
        sa.Column(
            "total_count", sa.Integer(), server_default="0", nullable=False
        ),
        sa.Column(
            "operator_id",
            sa.BINARY(16),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_notification_broadcasts_operator_id",
        "notification_broadcasts",
        ["operator_id"],
    )
    op.create_index(
        "ix_notification_broadcasts_revoked_at",
        "notification_broadcasts",
        ["revoked_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_notification_broadcasts_revoked_at",
        table_name="notification_broadcasts",
    )
    op.drop_index(
        "ix_notification_broadcasts_operator_id",
        table_name="notification_broadcasts",
    )
    op.drop_table("notification_broadcasts")
