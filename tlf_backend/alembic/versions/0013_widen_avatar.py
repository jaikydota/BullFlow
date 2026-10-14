"""media_accounts.platform_avatar: String(500) → Text

Revision ID: 0013_widen_avatar
Revises: 0012_provider_columns
Create Date: 2026-06-26 16:00:00.000000

海外平台（如 Instagram CDN）头像 URL 带长 token，可超 500 字符，落账时 DataError。
改 Text 不限长。
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_widen_avatar"
down_revision: Union[str, Sequence[str], None] = "0012_provider_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "media_accounts", "platform_avatar",
        type_=sa.Text(), existing_type=sa.String(500), existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "media_accounts", "platform_avatar",
        type_=sa.String(500), existing_type=sa.Text(), existing_nullable=True,
    )
