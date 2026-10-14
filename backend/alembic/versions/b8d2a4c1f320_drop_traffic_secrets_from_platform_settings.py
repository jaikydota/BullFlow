"""drop_traffic_secrets_from_platform_settings

流量密码已迁到独立表 traffic_secrets，platform_settings.traffic_secrets
键不再使用；从 SETTINGS_DEFAULTS 中移除后再删掉残留 row，避免
get_all_settings → merge_settings_defaults 反复 SELECT/INSERT 时撞主键。

Revision ID: b8d2a4c1f320
Revises: a7c1f3b9e210
Create Date: 2026-05-21 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "b8d2a4c1f320"
down_revision: Union[str, None] = "a7c1f3b9e210"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM platform_settings WHERE `key` = 'traffic_secrets'")


def downgrade() -> None:
    # 即便上面 DELETE 没命中（用户已手动删），回滚也安全地写一行空数组
    op.execute(
        "INSERT IGNORE INTO platform_settings (`key`, value) VALUES ('traffic_secrets', JSON_ARRAY())"
    )
