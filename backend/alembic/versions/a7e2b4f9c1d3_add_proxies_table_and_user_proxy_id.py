"""add_proxies_table_and_user_proxy_id

Revision ID: a7e2b4f9c1d3
Revises: f1a3d6c0892e
Create Date: 2026-05-23 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7e2b4f9c1d3"
down_revision: Union[str, None] = "a7e2f1c93d40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- proxies 表 ----
    op.create_table(
        "proxies",
        sa.Column("id", sa.BINARY(16), primary_key=True, comment="主键，UUID v7"),
        sa.Column("name", sa.String(100), nullable=False, comment="节点名"),
        sa.Column("region", sa.String(64), nullable=True, comment="地区"),
        sa.Column("server_add", sa.String(255), nullable=False, comment="代理 IP 或域名"),
        sa.Column("server_port", sa.Integer(), nullable=False, comment="代理端口"),
        sa.Column(
            "proxy_type",
            sa.Enum("socks5", "http", name="proxy_type"),
            nullable=False, server_default="socks5",
            comment="代理协议",
        ),
        sa.Column("user_name", sa.String(128), nullable=True, comment="代理鉴权用户名"),
        sa.Column("password", sa.String(255), nullable=True, comment="代理鉴权密码"),
        sa.Column("max_users", sa.Integer(), nullable=True, comment="容量上限；NULL=用全局默认"),
        sa.Column("expires_at", sa.DateTime(), nullable=True, comment="过期时间；NULL=永久"),
        sa.Column(
            "status",
            sa.Enum("active", "expired", "disabled", name="proxy_status"),
            nullable=False, server_default="active",
            comment="状态",
        ),
        sa.Column("order_no", sa.String(64), nullable=True, comment="采购订单号"),
        sa.Column("notes", sa.Text(), nullable=True, comment="管理员备注"),
        sa.Column(
            "created_by",
            sa.BINARY(16),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            comment="录入管理员",
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_proxies_status", "proxies", ["status"])
    op.create_index("ix_proxies_expires_at", "proxies", ["expires_at"])

    # ---- users.proxy_id 列 ----
    op.add_column(
        "users",
        sa.Column(
            "proxy_id",
            sa.BINARY(16),
            sa.ForeignKey("proxies.id", ondelete="SET NULL"),
            nullable=True,
            comment="绑定的代理 ID；NULL 表示未分配",
        ),
    )
    op.create_index("ix_users_proxy_id", "users", ["proxy_id"])


def downgrade() -> None:
    op.drop_index("ix_users_proxy_id", table_name="users")
    op.drop_constraint(None, "users", type_="foreignkey")  # noqa: F841
    op.drop_column("users", "proxy_id")

    op.drop_index("ix_proxies_expires_at", table_name="proxies")
    op.drop_index("ix_proxies_status", table_name="proxies")
    op.drop_table("proxies")
