"""generated_content 增加 description/tags

Revision ID: f4676e48e2e3
Revises: c5a1e3f7b209
Create Date: 2026-06-15 10:24:11.115216

只新增 generated_contents 表的 description / tags 两列（生成时 LLM 产出的发布元数据）。
autogenerate 检出的其它表 comment / index 漂移与本次变更无关，已手动剔除，迁移只包含上述两列。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f4676e48e2e3'
down_revision: Union[str, None] = 'c5a1e3f7b209'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'generated_contents',
        sa.Column('description', sa.Text(), nullable=True,
                  comment='发布用简介/文案（生成时 LLM 产出，发布时自动填入描述）'),
    )
    op.add_column(
        'generated_contents',
        sa.Column('tags', sa.JSON(none_as_null=True), nullable=True,
                  comment='发布用标签/话题关键词列表（生成时 LLM 产出，发布时自动填入标签）'),
    )


def downgrade() -> None:
    op.drop_column('generated_contents', 'tags')
    op.drop_column('generated_contents', 'description')
