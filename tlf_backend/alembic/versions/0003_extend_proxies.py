"""extend proxies: add order_no + notes

Revision ID: 0003_extend_proxies
Revises: 0002_admin_users
Create Date: 2026-05-29 10:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_extend_proxies"
down_revision: Union[str, Sequence[str], None] = "0002_admin_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("proxies", sa.Column("order_no", sa.String(64), nullable=True, comment="purchase order number"))
    op.add_column("proxies", sa.Column("notes", sa.Text(), nullable=True, comment="notes"))


def downgrade() -> None:
    op.drop_column("proxies", "notes")
    op.drop_column("proxies", "order_no")
