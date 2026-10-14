"""users.role 枚举加 finance（财务角色）

Revision ID: c7f2a9d4e631
Revises: b4d6f8a0c2e1
Create Date: 2026-06-27 10:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "c7f2a9d4e631"
down_revision: Union[str, None] = "b4d6f8a0c2e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users "
        "MODIFY COLUMN role ENUM('super_admin','admin','user','sales','finance') NOT NULL DEFAULT 'user' "
        "COMMENT '权限角色（super_admin/admin/user/sales/finance=财务）'"
    )


def downgrade() -> None:
    op.execute("UPDATE users SET role='user' WHERE role='finance'")
    op.execute(
        "ALTER TABLE users "
        "MODIFY COLUMN role ENUM('super_admin','admin','user','sales') NOT NULL DEFAULT 'user' "
        "COMMENT '权限角色（super_admin=超级管理员，admin=管理员，user=普通用户，sales=销售）'"
    )
