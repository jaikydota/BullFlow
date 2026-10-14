"""销售引流：users 加 role=sales / invitation_code / sales_id；删 saas_invitation_codes

Revision ID: b7d4e1f9a205
Revises: 9e3a1c7d5b04
Create Date: 2026-06-06 10:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.models.base


revision: str = "b7d4e1f9a205"
down_revision: Union[str, None] = "9e3a1c7d5b04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- 1. users.role 枚举加 sales（MySQL inline enum：MODIFY）----
    op.execute(
        "ALTER TABLE users "
        "MODIFY COLUMN role ENUM('super_admin','admin','user','sales') NOT NULL DEFAULT 'user' "
        "COMMENT '权限角色（super_admin=超级管理员，admin=管理员，user=普通用户，sales=销售）'"
    )

    # ---- 2. users 加引流字段 ----
    op.add_column(
        "users",
        sa.Column("invitation_code", sa.String(length=32), nullable=True, comment="销售员自己的固定引流邀请码"),
    )
    op.add_column(
        "users",
        sa.Column("sales_id", app.models.base.UUIDBin16(length=16), nullable=True, comment="引流该用户注册的销售用户 ID"),
    )
    op.create_index("ix_users_invitation_code", "users", ["invitation_code"], unique=True)
    op.create_index("ix_users_sales_id", "users", ["sales_id"], unique=False)
    op.create_foreign_key(
        "fk_users_sales_id_users", "users", "users", ["sales_id"], ["id"], ondelete="SET NULL"
    )

    # ---- 3. 删旧邀请码表 ----
    op.drop_table("saas_invitation_codes")


def downgrade() -> None:
    op.create_table(
        "saas_invitation_codes",
        sa.Column("id", app.models.base.UUIDBin16(length=16), nullable=False, comment="主键"),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column(
            "invite_type",
            sa.Enum("onetime", "permanent", "expire", name="saas_invite_type"),
            nullable=False,
        ),
        sa.Column("expire_days", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("active", "used", "disabled", name="saas_invite_status"),
            server_default="active",
            nullable=False,
        ),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("used_by_user_id", app.models.base.UUIDBin16(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["used_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_saas_invitation_codes_code", "saas_invitation_codes", ["code"], unique=True)
    op.create_index(
        "ix_saas_invitation_codes_used_by_user_id", "saas_invitation_codes", ["used_by_user_id"], unique=False
    )

    op.drop_constraint("fk_users_sales_id_users", "users", type_="foreignkey")
    op.drop_index("ix_users_sales_id", table_name="users")
    op.drop_index("ix_users_invitation_code", table_name="users")
    op.drop_column("users", "sales_id")
    op.drop_column("users", "invitation_code")

    op.execute(
        "ALTER TABLE users "
        "MODIFY COLUMN role ENUM('super_admin','admin','user') NOT NULL DEFAULT 'user'"
    )
