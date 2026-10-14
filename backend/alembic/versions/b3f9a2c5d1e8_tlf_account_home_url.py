"""tlf_accounts: add platform_home_url（平台用户主页 URL）

Revision ID: b3f9a2c5d1e8
Revises: e7c3a90f51d2
Create Date: 2026-06-16

推量发授权时由网关从作者信息拼出的平台用户主页 URL（如抖音 sec_uid → douyin.com/user/{sec_uid}），
随 webhook / 账号同步落库。纯加列，历史账号 NULL（下次授权 / 同步补齐），拼不出的平台始终 NULL。
任务监控逐账号「查看主页」优先用此 URL，缺失再按 platform_user_id 规律兜底。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b3f9a2c5d1e8'
down_revision: Union[str, None] = 'e7c3a90f51d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tlf_accounts', sa.Column('platform_home_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('tlf_accounts', 'platform_home_url')
