"""media_accounts 加 last_used_at（不活跃账号自动回收的活跃判定依据）

Revision ID: 0015_last_used_at
Revises: 0014_home_url_is_profile
Create Date: 2026-07-30 10:00:00.000000

灵径按会话按天扣费：长期不用/已掉线的账号持续扣费不划算。新增 last_used_at 记录最近一次被租户
「使用」（发布/取分类/刷指标/风控操作，不含登录态轮询检查）的时间，配合 last_authed_at 判定不活跃。

⚠️ 存量回填必须用**当前时间**而非 last_authed_at：历史发布行为没有戳，若按授权时间回填，
「30 天前授权但天天在发布」的账号会在部署后第一轮巡检被误 revoke（在用账号直接掉线）。
回填为 now 后所有存量账号从部署起有完整 N 天观察期，期间真实使用会持续刷新戳，
真闲置的账号 N 天后照样回收（仅多计费 N 天，远小于误杀在用账号的代价）。
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015_last_used_at"
down_revision: Union[str, Sequence[str], None] = "0014_home_url_is_profile"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "media_accounts",
        sa.Column(
            "last_used_at", sa.DateTime(), nullable=True,
            comment="最近一次被租户「使用」的时间（发布/取分类/刷指标/风控操作）。不含登录态轮询检查——"
                    "该字段与 last_authed_at 一起作为「不活跃自动回收」的活跃判定依据",
        ),
    )
    # 存量回填：一律取当前时间（UTC，与代码侧 datetime.utcnow 一致），给所有老账号
    # 完整的 N 天观察期——历史发布行为无戳，按 last_authed_at 回填会误杀「在用但很久没重扫」的账号
    op.execute("UPDATE media_accounts SET last_used_at = UTC_TIMESTAMP() WHERE last_used_at IS NULL")


def downgrade() -> None:
    op.drop_column("media_accounts", "last_used_at")
