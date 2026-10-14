"""generation_schedules 增加 distribute_config

Revision ID: d9f4b1e7c682
Revises: f4676e48e2e3
Create Date: 2026-06-15

新增 generation_schedules.distribute_config（完整分发配置 JSON：多平台/多账号/extras）。
纯加列，旧规则该列为 NULL，auto_distribute 回退旧单平台字段。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd9f4b1e7c682'
down_revision: Union[str, None] = 'f4676e48e2e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'generation_schedules',
        sa.Column('distribute_config', sa.JSON(none_as_null=True), nullable=True,
                  comment='完整分发配置：platforms/accounts/extras（对齐配置发布）'),
    )


def downgrade() -> None:
    op.drop_column('generation_schedules', 'distribute_config')
