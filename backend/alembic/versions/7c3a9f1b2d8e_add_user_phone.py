"""add_user_phone

Revision ID: 7c3a9f1b2d8e
Revises: c2b8d3e4f501
Create Date: 2026-05-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7c3a9f1b2d8e'
down_revision: Union[str, None] = 'c2b8d3e4f501'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'phone',
            sa.String(length=20),
            nullable=True,
            comment='登录手机号，E.164 格式不含 +（如 8613800138000），全局唯一',
        ),
    )
    op.create_unique_constraint('uq_users_phone', 'users', ['phone'])


def downgrade() -> None:
    op.drop_constraint('uq_users_phone', 'users', type_='unique')
    op.drop_column('users', 'phone')
