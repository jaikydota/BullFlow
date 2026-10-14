"""add admin_users table (推量发自有管理员)

Revision ID: 0002_admin_users
Revises: 0001_init_tlf
Create Date: 2026-05-28 19:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_admin_users"
down_revision: Union[str, Sequence[str], None] = "0001_init_tlf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "admin_users",
        sa.Column("id", sa.BINARY(16), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"),
                  server_onupdate=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("email", sa.String(190), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(128), nullable=False),
        sa.Column("name", sa.String(120), nullable=True),
        sa.Column("role", sa.Enum("super_admin", "admin", name="tlf_admin_role"),
                  nullable=False, server_default="admin"),
        sa.Column("status", sa.Enum("active", "disabled", name="tlf_admin_status"),
                  nullable=False, server_default="active"),
    )
    op.create_index("ix_admin_users_email", "admin_users", ["email"])


def downgrade() -> None:
    op.drop_table("admin_users")
    sa.Enum(name="tlf_admin_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="tlf_admin_role").drop(op.get_bind(), checkfirst=True)
