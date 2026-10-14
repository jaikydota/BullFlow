"""skills 表新增 recommended 推荐标记

Revision ID: c3d5e7f9b2e4
Revises: c3d5e7f9b2a4
Create Date: 2026-06-24

内容生成 skill 池新增「推荐」标记：后台可改，用户端选择时高亮展示。
注：挂在 c3d5e7f9b2a4 之后，确保其祖先 b2c4e6f8a1d3（建 skills 表）已先执行。
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d5e7f9b2e4"
down_revision: Union[str, None] = "c3d5e7f9b2a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "skills",
        sa.Column(
            "recommended",
            sa.Boolean(),
            nullable=False,
            server_default="0",
            comment="是否推荐（用户端高亮展示）",
        ),
    )


def downgrade() -> None:
    op.drop_column("skills", "recommended")
