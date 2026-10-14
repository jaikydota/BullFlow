"""合并两个 head：saas/发票链(a8e3f5b21c97) 与 tlf 链(widen_tlf_avatar)

Revision ID: e2f8c4a6b1d3
Revises: a8e3f5b21c97, widen_tlf_avatar
Create Date: 2026-06-18

历史原因：saas 计费相关迁移（套餐档位/增量包/对公/财务/发票）当初接在 tlf 链中部
(b3f9a2c5d1e8) 之后，与 tlf 链末端 head (widen_tlf_avatar) 形成两个并行 head。
本迁移仅做 head 合并（无 DDL），让 `alembic upgrade head` 重新收敛为单 head。
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


revision: str = "e2f8c4a6b1d3"
down_revision: Union[str, Sequence[str], None] = ("a8e3f5b21c97", "widen_tlf_avatar")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
