"""tenant_account_bindings: add external_user_id（代理 IP 粘性）

Revision ID: 0005_binding_euid
Revises: 0004_media_account
Create Date: 2026-06-08 10:00:00.000000

记录发起扫码绑定的子租户终端用户 ID，用于「同一用户的多个账号尽量分到同一代理 IP」。
纯加列，历史 binding 该列为 NULL（按新用户走负载均衡，下次扫码自然带上）。
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_binding_euid"
down_revision: Union[str, Sequence[str], None] = "0004_media_account"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenant_account_bindings", sa.Column("external_user_id", sa.String(128), nullable=True))
    op.create_index(
        "ix_tenant_account_bindings_external_user_id",
        "tenant_account_bindings", ["external_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_tenant_account_bindings_external_user_id", table_name="tenant_account_bindings")
    op.drop_column("tenant_account_bindings", "external_user_id")
