"""drop_marketing_notifications_from_platform_settings

营销通知 placeholder 被 admin broadcast 新模块取代；从 SETTINGS_DEFAULTS 移除后
清理 platform_settings 残留 row，避免 merge_settings_defaults 反复 SELECT/INSERT
撞主键（同 traffic_secrets 之前的修复套路）。

Revision ID: d5a8c2e07491
Revises: c4e7f9a13580
Create Date: 2026-05-22 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "d5a8c2e07491"
down_revision: Union[str, None] = "c4e7f9a13580"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "DELETE FROM platform_settings WHERE `key` = 'marketing_notifications'"
    )


def downgrade() -> None:
    op.execute(
        "INSERT IGNORE INTO platform_settings (`key`, value) VALUES "
        "('marketing_notifications', JSON_ARRAY())"
    )
