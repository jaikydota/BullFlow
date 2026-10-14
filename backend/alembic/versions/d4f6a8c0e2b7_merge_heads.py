"""合并多个并行 head（tlf 代理 / generated_content 媒体 / skills 推荐）

Revision ID: d4f6a8c0e2b7
Revises: a7e2b4f9c1d3, a1b2c3d4e5f6, c3d5e7f9b2e4
Create Date: 2026-06-24

历史上多个特性分支各自产生迁移，导致 alembic 出现 3 个 head：
- a7e2b4f9c1d3：proxies 表 + user.proxy_id
- a1b2c3d4e5f6：distribution_tasks 账号快照
- c3d5e7f9b2e4：skills.recommended（其链路含 generated_content 媒体字段、skills 建表）

本迁移仅做图谱合并，无 DDL。
"""
from __future__ import annotations

from typing import Sequence, Union


revision: str = "d4f6a8c0e2b7"
down_revision: Union[str, Sequence[str], None] = (
    "a7e2b4f9c1d3",
    "a1b2c3d4e5f6",
    "c3d5e7f9b2e4",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
