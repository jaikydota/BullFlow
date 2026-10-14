"""为 generated_contents 增加 media_urls / layout

Revision ID: c3d5e7f9b2a4
Revises: b2c4e6f8a1d3
Create Date: 2026-06-23

支持两种「图 + 文」内容：
- 图文混编（layout=mixed，文章正文内嵌多张配图）
- 图文分离（layout=dynamic，多张图片 + 一段发布文案）
media_urls 存多图 URL 列表；layout 标记形态。
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d5e7f9b2a4"
down_revision: Union[str, None] = "b2c4e6f8a1d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "generated_contents",
        sa.Column(
            "media_urls",
            sa.JSON(none_as_null=True),
            nullable=True,
            comment="多图 URL 列表：图文分离=全部图；图文混编=正文内嵌图的有序列表",
        ),
    )
    op.add_column(
        "generated_contents",
        sa.Column(
            "layout",
            sa.String(20),
            nullable=True,
            comment="形态：mixed=图文混编文章 / dynamic=图文分离图片动态 / NULL=普通",
        ),
    )


def downgrade() -> None:
    op.drop_column("generated_contents", "layout")
    op.drop_column("generated_contents", "media_urls")
