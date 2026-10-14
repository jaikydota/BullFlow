"""rename lapi_* tables/columns to tlf_* (消费侧统一对接推量发，去 lapi 概念)

Revision ID: f3a4b5c6d7e8
Revises: e1f2a3b4c5d6
Create Date: 2026-05-29 14:00:00.000000

主 backend（分发使用侧）只对接推量发网关，不再有 lapi 概念。表/列统一改名：
  lapi_accounts            -> tlf_accounts            (lapi_account_id  -> tlf_account_id)
  lapi_account_metrics     -> tlf_account_metrics     (lapi_account_id  -> tlf_account_id)
  lapi_distribution_tasks  -> tlf_distribution_tasks  (lapi_operation_id-> tlf_operation_id)
索引/约束名保持原状（仅内部命名，不影响运行）。
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, Sequence[str], None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(bind, name: str) -> bool:
    return sa.inspect(bind).has_table(name)


def _has_col(bind, table: str, col: str) -> bool:
    return any(c["name"] == col for c in sa.inspect(bind).get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()

    # 1) 重命名表
    if _has_table(bind, "lapi_accounts") and not _has_table(bind, "tlf_accounts"):
        op.rename_table("lapi_accounts", "tlf_accounts")
    if _has_table(bind, "lapi_distribution_tasks") and not _has_table(bind, "tlf_distribution_tasks"):
        op.rename_table("lapi_distribution_tasks", "tlf_distribution_tasks")
    if _has_table(bind, "lapi_account_metrics") and not _has_table(bind, "tlf_account_metrics"):
        op.rename_table("lapi_account_metrics", "tlf_account_metrics")

    # 2) 重命名列
    if _has_col(bind, "tlf_accounts", "lapi_account_id"):
        op.alter_column(
            "tlf_accounts", "lapi_account_id",
            new_column_name="tlf_account_id",
            existing_type=sa.String(64), existing_nullable=False,
        )
    if _has_col(bind, "tlf_account_metrics", "lapi_account_id"):
        op.alter_column(
            "tlf_account_metrics", "lapi_account_id",
            new_column_name="tlf_account_id",
            existing_type=sa.BINARY(16), existing_nullable=False,
        )
    if _has_col(bind, "tlf_distribution_tasks", "lapi_operation_id"):
        op.alter_column(
            "tlf_distribution_tasks", "lapi_operation_id",
            new_column_name="tlf_operation_id",
            existing_type=sa.String(64), existing_nullable=True,
        )


def downgrade() -> None:
    bind = op.get_bind()

    if _has_col(bind, "tlf_accounts", "tlf_account_id"):
        op.alter_column(
            "tlf_accounts", "tlf_account_id",
            new_column_name="lapi_account_id",
            existing_type=sa.String(64), existing_nullable=False,
        )
    if _has_col(bind, "tlf_account_metrics", "tlf_account_id"):
        op.alter_column(
            "tlf_account_metrics", "tlf_account_id",
            new_column_name="lapi_account_id",
            existing_type=sa.BINARY(16), existing_nullable=False,
        )
    if _has_col(bind, "tlf_distribution_tasks", "tlf_operation_id"):
        op.alter_column(
            "tlf_distribution_tasks", "tlf_operation_id",
            new_column_name="lapi_operation_id",
            existing_type=sa.String(64), existing_nullable=True,
        )

    if _has_table(bind, "tlf_accounts"):
        op.rename_table("tlf_accounts", "lapi_accounts")
    if _has_table(bind, "tlf_distribution_tasks"):
        op.rename_table("tlf_distribution_tasks", "lapi_distribution_tasks")
    if _has_table(bind, "tlf_account_metrics"):
        op.rename_table("tlf_account_metrics", "lapi_account_metrics")
