"""drop distribution_tasks（海外分发平台已移除）

Revision ID: e7c3a90f51d2
Revises: d9f4b1e7c682
Create Date: 2026-06-15

海外矩阵分发（GEO 平台）功能整体移除，删除其任务表 distribution_tasks。
chat_messages.distribution_results 列保留（历史聊天消息兼容，不再写入）。
overseas_accounts 配额字段保留（待接入新海外平台复用）。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = 'e7c3a90f51d2'
down_revision: Union[str, None] = 'd9f4b1e7c682'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('distribution_tasks')


def downgrade() -> None:
    # 不还原（功能已移除）；保留占位避免 downgrade 报错。
    op.create_table(
        'distribution_tasks',
        sa.Column('id', sa.BINARY(length=16), nullable=False),
        sa.Column('user_id', sa.BINARY(length=16), nullable=False),
        sa.Column('created_at', mysql.DATETIME(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', mysql.DATETIME(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
