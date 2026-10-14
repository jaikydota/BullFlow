"""tlf_accounts.platform_avatar: String(500) → Text

Revision ID: widen_tlf_avatar
Revises: e5a7c9f1b3d6
Create Date: 2026-06-26 16:10:00.000000

海外平台（Instagram 等）头像 URL 可超 500 字符，webhook 转发落 TlfAccount 时 DataError。
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "widen_tlf_avatar"
down_revision: Union[str, Sequence[str], None] = "e5a7c9f1b3d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "tlf_accounts", "platform_avatar",
        type_=sa.Text(), existing_type=sa.String(500), existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "tlf_accounts", "platform_avatar",
        type_=sa.String(500), existing_type=sa.Text(), existing_nullable=True,
    )
