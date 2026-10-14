"""platform_policies：平台级发布策略表（首期：是否允许含链接发帖）

Revision ID: 0016_platform_policy
Revises: 0015_last_used_at
Create Date: 2026-09-21 12:00:00.000000

X/Twitter 2026 起按次计费，含链接帖子单价约为普通帖子的 13 倍（≈$0.20 vs $0.015）。
建表并**预置 Twitter 一行 allow_links=0**（默认禁止含链接发帖，后台可随时打开），
其余平台不建行 = 默认允许，行为不变。
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016_platform_policy"
down_revision: Union[str, Sequence[str], None] = "0015_last_used_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "platform_policies",
        sa.Column("id", sa.BINARY(16), primary_key=True, comment="主键，UUID v7（时序 ID）"),
        sa.Column("platform_code", sa.String(32), nullable=False,
                  comment="平台代码（DouYin / Twitter / ...），一平台一行"),
        sa.Column("allow_links", sa.Boolean(), nullable=False, server_default=sa.text("1"),
                  comment="是否允许发布含链接的内容"),
        sa.Column("note", sa.Text(), nullable=True, comment="备注（如关闭原因）"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), comment="创建时间"),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), comment="最后更新时间"),
        sa.UniqueConstraint("platform_code", name="uq_platform_policies_platform_code"),
    )
    # 预置：X/Twitter 默认禁止含链接发帖（成本保护），后台「平台能力」页可一键打开
    op.execute(
        "INSERT INTO platform_policies (id, platform_code, allow_links, note) VALUES ("
        "UNHEX(REPLACE(UUID(), '-', '')), 'Twitter', 0, "
        "'X 含链接帖子按次计费约 $0.20/条（普通帖约 $0.015），默认关闭，确认预算后再打开')"
    )


def downgrade() -> None:
    op.drop_table("platform_policies")
