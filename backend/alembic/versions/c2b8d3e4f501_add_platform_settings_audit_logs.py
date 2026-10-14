"""add platform_settings and admin_audit_logs

Revision ID: c2b8d3e4f501
Revises: ae4f9210c3ab
Create Date: 2026-05-18

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.models.base

revision: str = "c2b8d3e4f501"
down_revision: Union[str, None] = "ae4f9210c3ab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "platform_settings",
        sa.Column(
            "key",
            sa.String(length=100),
            nullable=False,
            comment="唯一键",
        ),
        sa.Column("value", sa.JSON(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("key"),
    )

    op.create_table(
        "admin_audit_logs",
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=True),
        sa.Column("resource_id", sa.String(length=64), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column(
            "id",
            app.models.base.UUIDBin16(length=16),
            nullable=False,
            comment="主键",
        ),
        sa.Column(
            "operator_id",
            app.models.base.UUIDBin16(length=16),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["operator_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_admin_audit_logs_operator_id"),
        "admin_audit_logs",
        ["operator_id"],
        unique=False,
    )
    op.create_index(op.f("ix_admin_audit_logs_created_at"), "admin_audit_logs", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_admin_audit_logs_created_at"), table_name="admin_audit_logs")
    op.drop_index(op.f("ix_admin_audit_logs_operator_id"), table_name="admin_audit_logs")
    op.drop_table("admin_audit_logs")
    op.drop_table("platform_settings")
