"""新增内容生成 skill 池表 skills

Revision ID: b2c4e6f8a1d3
Revises: f1a2b3c4d5e6
Create Date: 2026-06-22

内容生成「skill 池」：预设提示词模板（全局共享，无 user_id，后台管理）。
用户生成文章/图片/视频或对话时选一个 skill，把 prompt 注入生成。
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c4e6f8a1d3"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "skills",
        sa.Column("id", sa.BINARY(16), primary_key=True, comment="主键，UUID v7"),
        sa.Column("slug", sa.String(100), nullable=False, comment="业务唯一标识"),
        sa.Column("name", sa.String(255), nullable=False, comment="skill 名称"),
        sa.Column("description", sa.String(500), nullable=True, comment="一句话说明"),
        sa.Column("prompt", sa.Text(), nullable=False, comment="skill 完整提示词"),
        sa.Column("content_types", sa.JSON(none_as_null=True), nullable=True, comment="适用生成类型：article/image/video/chat"),
        sa.Column("platforms", sa.JSON(none_as_null=True), nullable=True, comment="适用平台 code（空=通用）"),
        sa.Column("category", sa.String(50), nullable=True, comment="分组"),
        sa.Column("icon", sa.String(50), nullable=True, comment="图标（lucide 名或 emoji）"),
        sa.Column("source_url", sa.String(500), nullable=True, comment="出处链接"),
        sa.Column(
            "status",
            sa.Enum("active", "inactive", name="skill_status"),
            nullable=False,
            server_default="active",
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0", comment="展示排序，越小越前"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_skills_slug", "skills", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_skills_slug", table_name="skills")
    op.drop_table("skills")
