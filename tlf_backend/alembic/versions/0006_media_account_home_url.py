"""media_accounts: add platform_home_url（平台用户主页 URL）

Revision ID: 0006_media_home_url
Revises: 0005_binding_euid
Create Date: 2026-06-16 10:00:00.000000

授权成功时从作者信息接口拼出的平台用户主页 URL（当前抖音 sec_uid → douyin.com/user/{sec_uid}）。
纯加列，历史账号该列 NULL（下次扫码授权 / 回填脚本补齐），拼不出的平台始终 NULL。
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_media_home_url"
down_revision: Union[str, Sequence[str], None] = "0005_binding_euid"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("media_accounts", sa.Column("platform_home_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("media_accounts", "platform_home_url")
