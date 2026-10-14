"""add_feedbacks_table

Revision ID: c5a1e3f7b209
Revises: b7d4e1f9a205
Create Date: 2026-06-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c5a1e3f7b209"
down_revision: Union[str, None] = "b7d4e1f9a205"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "feedbacks",
        sa.Column("id", sa.BINARY(16), primary_key=True, comment="主键，UUID v7"),
        sa.Column("user_id", sa.BINARY(16), nullable=False, comment="所属用户 ID，多租户隔离键"),
        sa.Column(
            "category",
            sa.Enum("suggestion", "bug", "other", name="feedback_category"),
            server_default="suggestion",
            nullable=False,
            comment="反馈类型",
        ),
        sa.Column("content", sa.Text(), nullable=False, comment="反馈正文"),
        sa.Column("images", sa.JSON(), nullable=True, comment="截图 URL 列表"),
        sa.Column("contact", sa.String(255), nullable=True, comment="联系方式（可选）"),
        sa.Column(
            "status",
            sa.Enum("pending", "resolved", name="feedback_status"),
            server_default="pending",
            nullable=False,
            comment="处理状态",
        ),
        sa.Column("reply", sa.Text(), nullable=True, comment="管理员回复内容"),
        sa.Column("replied_at", sa.DateTime(), nullable=True, comment="回复时间（UTC）"),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
    )
    # 用户维度隔离 + 列表分页（用户端按 user_id 查自己的反馈，倒序）
    op.create_index("ix_feedbacks_user_id", "feedbacks", ["user_id"])
    # 后台按状态筛选
    op.create_index("ix_feedbacks_status", "feedbacks", ["status"])
    # 后台列表整体倒序
    op.create_index("ix_feedbacks_created_at", "feedbacks", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_feedbacks_created_at", table_name="feedbacks")
    op.drop_index("ix_feedbacks_status", table_name="feedbacks")
    op.drop_index("ix_feedbacks_user_id", table_name="feedbacks")
    op.drop_table("feedbacks")
