"""fix_null_literal_json_columns

SQLAlchemy 的 sa.JSON() 默认会把 Python None 写成 JSON literal `null`
（4 字符字符串），而不是 SQL NULL。这里清理 NotificationBroadcast.target_user_ids
和 Notification.extra 两列里已经写入的 'null' literal，重置为真 NULL。
配合 model 改成 JSON(none_as_null=True) 后，未来写入直接是 NULL。

Revision ID: f1a3d6c0892e
Revises: e9b1c4a82367
Create Date: 2026-05-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "f1a3d6c0892e"
down_revision: Union[str, None] = "e9b1c4a82367"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # JSON_TYPE() 返回 'NULL' 字符串表示该列值是 JSON null literal（区别于 SQL NULL）
    op.execute(
        "UPDATE notification_broadcasts "
        "SET target_user_ids = NULL "
        "WHERE target_user_ids IS NOT NULL "
        "  AND JSON_TYPE(target_user_ids) = 'NULL'"
    )
    op.execute(
        "UPDATE notifications "
        "SET extra = NULL "
        "WHERE extra IS NOT NULL "
        "  AND JSON_TYPE(extra) = 'NULL'"
    )


def downgrade() -> None:
    # 不可逆：'null' literal 与真 NULL 在业务语义上等价，无需还原
    pass
