"""add saas admin tables (plans addons orders invitations)

Revision ID: ae4f9210c3ab
Revises: 6493ab716eb7
Create Date: 2026-05-18

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.models.base

# revision identifiers, used by Alembic.
revision: str = "ae4f9210c3ab"
down_revision: Union[str, None] = "6493ab716eb7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "saas_plans",
        sa.Column("slug", sa.String(length=64), nullable=False, comment="套餐标识"),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("price_cents", sa.Integer(), server_default="0", nullable=False, comment="定价（分）"),
        sa.Column(
            "period",
            sa.Enum("month", "year", name="saas_plan_period"),
            server_default="month",
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("active", "inactive", name="saas_plan_status"),
            server_default="active",
            nullable=False,
        ),
        sa.Column("points_quota", sa.Integer(), server_default="0", nullable=False),
        sa.Column("storage_gb", sa.Integer(), server_default="0", nullable=False),
        sa.Column("domestic_accounts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("overseas_accounts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("features", sa.JSON(), nullable=True, comment="权益文案列表"),
        sa.Column(
            "id",
            app.models.base.UUIDBin16(length=16),
            nullable=False,
            comment="主键",
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_saas_plans_slug"), "saas_plans", ["slug"], unique=True)

    op.create_table(
        "saas_addons",
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "addon_type",
            sa.Enum(
                "points",
                "storage",
                "domestic_account",
                "overseas_account",
                name="saas_addon_type",
            ),
            nullable=False,
        ),
        sa.Column("unit_label", sa.String(length=255), nullable=False),
        sa.Column("price_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "status",
            sa.Enum("active", "inactive", name="saas_addon_status"),
            server_default="active",
            nullable=False,
        ),
        sa.Column(
            "id",
            app.models.base.UUIDBin16(length=16),
            nullable=False,
            comment="主键",
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_saas_addons_slug"), "saas_addons", ["slug"], unique=True)

    op.create_table(
        "saas_orders",
        sa.Column("order_no", sa.String(length=64), nullable=False),
        sa.Column(
            "user_id",
            app.models.base.UUIDBin16(length=16),
            nullable=False,
        ),
        sa.Column("tenant_display_name", sa.String(length=255), nullable=True),
        sa.Column(
            "order_type",
            sa.Enum("subscription", "recharge", "value_added", name="saas_order_type"),
            nullable=False,
        ),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column(
            "pay_method",
            sa.Enum(
                "alipay",
                "wechat",
                "stripe",
                "paypal",
                "transfer",
                "offline",
                name="saas_pay_method",
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("pending", "paid", "cancelled", "refunded", name="saas_order_status"),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("plan_slug", sa.String(length=64), nullable=True),
        sa.Column("actual_revenue_cents", sa.Integer(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("voucher_url", sa.String(length=1000), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column(
            "id",
            app.models.base.UUIDBin16(length=16),
            nullable=False,
            comment="主键",
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_saas_orders_order_no"), "saas_orders", ["order_no"], unique=True)
    op.create_index(op.f("ix_saas_orders_user_id"), "saas_orders", ["user_id"], unique=False)

    op.create_table(
        "saas_invitation_codes",
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column(
            "invite_type",
            sa.Enum("onetime", "permanent", "expire", name="saas_invite_type"),
            nullable=False,
        ),
        sa.Column("expire_days", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("active", "used", "disabled", name="saas_invite_status"),
            server_default="active",
            nullable=False,
        ),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("used_by_user_id", app.models.base.UUIDBin16(length=16), nullable=True),
        sa.Column(
            "id",
            app.models.base.UUIDBin16(length=16),
            nullable=False,
            comment="主键",
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["used_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_saas_invitation_codes_code"), "saas_invitation_codes", ["code"], unique=True)
    op.create_index(
        op.f("ix_saas_invitation_codes_used_by_user_id"),
        "saas_invitation_codes",
        ["used_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_saas_invitation_codes_used_by_user_id"), table_name="saas_invitation_codes")
    op.drop_index(op.f("ix_saas_invitation_codes_code"), table_name="saas_invitation_codes")
    op.drop_table("saas_invitation_codes")

    op.drop_index(op.f("ix_saas_orders_user_id"), table_name="saas_orders")
    op.drop_index(op.f("ix_saas_orders_order_no"), table_name="saas_orders")
    op.drop_table("saas_orders")

    op.drop_index(op.f("ix_saas_addons_slug"), table_name="saas_addons")
    op.drop_table("saas_addons")

    op.drop_index(op.f("ix_saas_plans_slug"), table_name="saas_plans")
    op.drop_table("saas_plans")
