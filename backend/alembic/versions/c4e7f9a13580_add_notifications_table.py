"""add_notifications_table

Revision ID: c4e7f9a13580
Revises: b8d2a4c1f320
Create Date: 2026-05-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4e7f9a13580"
down_revision: Union[str, None] = "b8d2a4c1f320"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.BINARY(16), primary_key=True, comment="主键，UUID v7"),
        sa.Column("user_id", sa.BINARY(16), nullable=False, comment="所属用户 ID，多租户隔离键"),
        sa.Column("type", sa.String(64), nullable=False, comment="事件类型"),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("link_url", sa.String(500), nullable=True),
        sa.Column("extra", sa.JSON(), nullable=True),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
    )
    # 列表分页主索引：按用户 + 时间倒序
    op.create_index(
        "ix_notifications_user_created",
        "notifications",
        ["user_id", "created_at"],
    )
    # 未读计数
    op.create_index("ix_notifications_read_at", "notifications", ["read_at"])
    # 类型筛选
    op.create_index("ix_notifications_type", "notifications", ["type"])


def downgrade() -> None:
    op.drop_index("ix_notifications_type", table_name="notifications")
    op.drop_index("ix_notifications_read_at", table_name="notifications")
    op.drop_index("ix_notifications_user_created", table_name="notifications")
    op.drop_table("notifications")
