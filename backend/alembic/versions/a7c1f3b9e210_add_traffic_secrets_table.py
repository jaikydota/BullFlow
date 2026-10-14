"""add_traffic_secrets_table

Revision ID: a7c1f3b9e210
Revises: 8f2d7a1c4b3e
Create Date: 2026-05-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7c1f3b9e210"
down_revision: Union[str, None] = "8f2d7a1c4b3e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "traffic_secrets",
        sa.Column("id", sa.BINARY(16), primary_key=True, comment="主键，UUID v7"),
        sa.Column("title", sa.String(128), nullable=False, comment="标题"),
        sa.Column("icon", sa.String(16), nullable=True, comment="emoji 字符"),
        sa.Column(
            "icon_url",
            sa.String(500),
            nullable=True,
            comment="可选图片地址；前端优先于 emoji",
        ),
        sa.Column("description", sa.String(512), nullable=True, comment="一句话描述"),
        sa.Column("tags", sa.JSON(), nullable=True, comment="标签数组"),
        sa.Column("rating", sa.Numeric(2, 1), nullable=True, comment="星评分 0-5"),
        sa.Column("category", sa.String(64), nullable=True, comment="分类"),
        sa.Column("source", sa.String(16), nullable=True, comment="company / partner"),
        sa.Column(
            "price_status",
            sa.String(16),
            nullable=True,
            comment="free / trial / subscription / in-app",
        ),
        sa.Column("content_markdown", sa.Text(), nullable=True, comment="详情 markdown"),
        sa.Column("url", sa.String(500), nullable=False, comment="跳转地址"),
        sa.Column(
            "sort_order",
            sa.Integer(),
            server_default="0",
            nullable=False,
            comment="排序，升序",
        ),
        sa.Column(
            "is_enabled",
            sa.Boolean(),
            server_default=sa.true(),
            nullable=False,
            comment="是否启用",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_traffic_secrets_sort_order", "traffic_secrets", ["sort_order"])
    op.create_index("ix_traffic_secrets_is_enabled", "traffic_secrets", ["is_enabled"])

    # 旧 JSON 数据弃用：清空 platform_settings.traffic_secrets 但保留 key
    op.execute(
        "UPDATE platform_settings SET value = JSON_ARRAY() WHERE `key` = 'traffic_secrets'"
    )


def downgrade() -> None:
    op.drop_index("ix_traffic_secrets_is_enabled", table_name="traffic_secrets")
    op.drop_index("ix_traffic_secrets_sort_order", table_name="traffic_secrets")
    op.drop_table("traffic_secrets")
