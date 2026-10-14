"""drop proxies table + users.proxy_id (代理已迁移到推量发 tlf_backend)

Revision ID: e1f2a3b4c5d6
Revises: c8d4f5a31e07
Create Date: 2026-05-29 12:00:00.000000

主 backend 不再直连灵径、不再管理代理池，代理统一由推量发（tlf_backend，独立库
matrix365_tlf.proxies）管理。这里清掉主库残留的 proxies 表与 users.proxy_id 列。
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "c8d4f5a31e07"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _fk_name(bind, table: str, ref_table: str) -> str | None:
    """查 table 上指向 ref_table 的外键名（不同 MySQL 自动命名不一）。"""
    insp = sa.inspect(bind)
    for fk in insp.get_foreign_keys(table):
        if fk.get("referred_table") == ref_table:
            return fk.get("name")
    return None


def _has_column(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    return any(c["name"] == column for c in insp.get_columns(table))


def _has_table(bind, table: str) -> bool:
    return sa.inspect(bind).has_table(table)


def upgrade() -> None:
    bind = op.get_bind()

    # 1) 先删 users.proxy_id（含其外键 + 索引）
    if _has_column(bind, "users", "proxy_id"):
        fk = _fk_name(bind, "users", "proxies")
        if fk:
            op.drop_constraint(fk, "users", type_="foreignkey")
        # 索引名通常是 ix_users_proxy_id，drop_column 在 MySQL 会一并处理；保险起见 try
        try:
            op.drop_index("ix_users_proxy_id", table_name="users")
        except Exception:
            pass
        op.drop_column("users", "proxy_id")

    # 2) 删 proxies 表
    if _has_table(bind, "proxies"):
        op.drop_table("proxies")


def downgrade() -> None:
    # 重建 proxies 表（与原 a7e2b4f9c1d3 结构一致）
    op.create_table(
        "proxies",
        sa.Column("id", sa.BINARY(16), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("region", sa.String(64), nullable=True),
        sa.Column("server_add", sa.String(255), nullable=False),
        sa.Column("server_port", sa.Integer(), nullable=False),
        sa.Column("proxy_type", sa.Enum("socks5", "http", name="proxy_type"),
                  nullable=False, server_default="socks5"),
        sa.Column("user_name", sa.String(128), nullable=True),
        sa.Column("password", sa.String(255), nullable=True),
        sa.Column("max_users", sa.Integer(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.Enum("active", "expired", "disabled", name="proxy_status"),
                  nullable=False, server_default="active"),
        sa.Column("order_no", sa.String(64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.BINARY(16), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"),
                  server_onupdate=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.add_column("users", sa.Column("proxy_id", sa.BINARY(16), nullable=True))
    op.create_index("ix_users_proxy_id", "users", ["proxy_id"])
    op.create_foreign_key(
        "fk_users_proxy_id", "users", "proxies", ["proxy_id"], ["id"], ondelete="SET NULL"
    )
