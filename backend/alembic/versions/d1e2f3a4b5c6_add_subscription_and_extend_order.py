"""add saas_subscriptions table and extend saas_orders with gateway fields

Revision ID: d1e2f3a4b5c6
Revises: 7c3a9f1b2d8e
Create Date: 2026-05-19 12:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.models.base


revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "7c3a9f1b2d8e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- 1. saas_orders 加 gateway 字段 ----
    op.add_column(
        "saas_orders",
        sa.Column(
            "pay_channel",
            sa.Enum("allinpay", "transfer", "offline", name="saas_pay_channel"),
            nullable=True,
            comment="实际支付网关",
        ),
    )
    op.add_column("saas_orders", sa.Column("pay_type_code", sa.String(length=16), nullable=True))
    op.add_column("saas_orders", sa.Column("gateway_trxid", sa.String(length=64), nullable=True))
    op.add_column("saas_orders", sa.Column("gateway_reqsn", sa.String(length=64), nullable=True))
    op.add_column("saas_orders", sa.Column("qrcode_url", sa.String(length=1000), nullable=True))
    op.add_column("saas_orders", sa.Column("expires_at", sa.DateTime(), nullable=True))
    op.add_column("saas_orders", sa.Column("gateway_raw", sa.JSON(), nullable=True))
    op.create_index(
        "ix_saas_orders_gateway_reqsn", "saas_orders", ["gateway_reqsn"], unique=False
    )

    # ---- 2. 新建 saas_subscriptions ----
    op.create_table(
        "saas_subscriptions",
        sa.Column(
            "id",
            app.models.base.UUIDBin16(length=16),
            nullable=False,
            comment="主键",
        ),
        sa.Column(
            "user_id",
            app.models.base.UUIDBin16(length=16),
            nullable=False,
            comment="租户主账号",
        ),
        sa.Column("plan_slug", sa.String(length=64), nullable=False, comment="套餐快照"),
        sa.Column(
            "period",
            sa.Enum("month", "year", name="saas_subscription_period"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("active", "expired", "cancelled", name="saas_subscription_status"),
            server_default="active",
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column(
            "source_order_id",
            app.models.base.UUIDBin16(length=16),
            nullable=True,
        ),
        sa.Column("points_quota", sa.Integer(), server_default="0", nullable=False),
        sa.Column("storage_gb_quota", sa.Integer(), server_default="0", nullable=False),
        sa.Column("domestic_accounts_quota", sa.Integer(), server_default="0", nullable=False),
        sa.Column("overseas_accounts_quota", sa.Integer(), server_default="0", nullable=False),
        sa.Column("points_used", sa.Integer(), server_default="0", nullable=False),
        sa.Column("storage_bytes_used", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("domestic_accounts_used", sa.Integer(), server_default="0", nullable=False),
        sa.Column("overseas_accounts_used", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_order_id"], ["saas_orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_saas_subscriptions_user_id"), "saas_subscriptions", ["user_id"], unique=False)
    op.create_index(op.f("ix_saas_subscriptions_plan_slug"), "saas_subscriptions", ["plan_slug"], unique=False)
    op.create_index(op.f("ix_saas_subscriptions_status"), "saas_subscriptions", ["status"], unique=False)
    op.create_index(op.f("ix_saas_subscriptions_expires_at"), "saas_subscriptions", ["expires_at"], unique=False)

    # ---- 3. 老用户数据回填：每人一条 free 订阅 ----
    # 注意：需要 saas_plans 中存在 slug='free' 的套餐；若没有，本回填段会跳过（用 free plan 的 quota）
    # 简化处理：用硬编码 free quota（与 seed 一致）；后续 plan 改了不影响回填。
    op.execute(
        """
        INSERT INTO saas_subscriptions
            (id, user_id, plan_slug, period, status, started_at, expires_at,
             points_quota, storage_gb_quota, domestic_accounts_quota, overseas_accounts_quota,
             points_used, storage_bytes_used, domestic_accounts_used, overseas_accounts_used,
             created_at, updated_at)
        SELECT
            UNHEX(REPLACE(UUID(), '-', '')) AS id,
            u.id AS user_id,
            'free' AS plan_slug,
            'month' AS period,
            'active' AS status,
            NOW() AS started_at,
            DATE_ADD(NOW(), INTERVAL 100 YEAR) AS expires_at,
            1000, 5, 1, 0,
            0, 0, 0, 0,
            NOW(), NOW()
        FROM users u
        WHERE NOT EXISTS (
            SELECT 1 FROM saas_subscriptions s
            WHERE s.user_id = u.id AND s.status = 'active'
        )
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_saas_subscriptions_expires_at"), table_name="saas_subscriptions")
    op.drop_index(op.f("ix_saas_subscriptions_status"), table_name="saas_subscriptions")
    op.drop_index(op.f("ix_saas_subscriptions_plan_slug"), table_name="saas_subscriptions")
    op.drop_index(op.f("ix_saas_subscriptions_user_id"), table_name="saas_subscriptions")
    op.drop_table("saas_subscriptions")
    # MySQL: enum 类型随表删除，无需单独 drop

    op.drop_index("ix_saas_orders_gateway_reqsn", table_name="saas_orders")
    op.drop_column("saas_orders", "gateway_raw")
    op.drop_column("saas_orders", "expires_at")
    op.drop_column("saas_orders", "qrcode_url")
    op.drop_column("saas_orders", "gateway_reqsn")
    op.drop_column("saas_orders", "gateway_trxid")
    op.drop_column("saas_orders", "pay_type_code")
    op.drop_column("saas_orders", "pay_channel")
