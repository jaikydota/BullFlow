"""add saas_invoices table（订单开发票）

Revision ID: a8e3f5b21c97
Revises: c7f2a9d4e631
Create Date: 2026-06-27 14:00:00.000000

用户对已支付订单申请开票（pending），财务回填发票号 + 上传发票文件后置 issued，
或驳回置 rejected。一订单一票（order_id 唯一）。
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.models.base


revision: str = "a8e3f5b21c97"
down_revision: Union[str, None] = "c7f2a9d4e631"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "saas_invoices",
        sa.Column("id", app.models.base.UUIDBin16(length=16), nullable=False, comment="主键"),
        sa.Column(
            "order_id",
            app.models.base.UUIDBin16(length=16),
            nullable=False,
            comment="对应订单 saas_orders.id（一订单一票）",
        ),
        sa.Column(
            "user_id",
            app.models.base.UUIDBin16(length=16),
            nullable=False,
            comment="申请用户 users.id",
        ),
        sa.Column(
            "status",
            sa.Enum("pending", "issued", "rejected", "voided", name="saas_invoice_status"),
            server_default="pending",
            nullable=False,
            comment="pending=待开 issued=已开 rejected=驳回 voided=作废",
        ),
        sa.Column(
            "title_type",
            sa.Enum("personal", "company", name="saas_invoice_title_type"),
            nullable=False,
            comment="抬头类型：个人 / 企业",
        ),
        sa.Column("title", sa.String(length=255), nullable=False, comment="发票抬头"),
        sa.Column("tax_no", sa.String(length=64), nullable=True, comment="税号（企业必填）"),
        sa.Column(
            "invoice_kind",
            sa.Enum("normal", "special", name="saas_invoice_kind"),
            nullable=False,
            comment="发票类型：普票 / 专票",
        ),
        sa.Column("reg_address", sa.String(length=255), nullable=True, comment="注册地址（专票）"),
        sa.Column("reg_phone", sa.String(length=32), nullable=True, comment="注册电话（专票）"),
        sa.Column("bank_name", sa.String(length=128), nullable=True, comment="开户行（专票）"),
        sa.Column("bank_account", sa.String(length=64), nullable=True, comment="银行账号（专票）"),
        sa.Column("email", sa.String(length=255), nullable=True, comment="收票邮箱"),
        sa.Column("amount_cents", sa.Integer(), nullable=False, comment="开票金额（分）= 订单实收快照"),
        sa.Column("invoice_no", sa.String(length=64), nullable=True, comment="发票号（财务回填）"),
        sa.Column(
            "invoice_file_url",
            sa.String(length=1000),
            nullable=True,
            comment="发票文件 URL（财务上传）",
        ),
        sa.Column("issued_at", sa.DateTime(), nullable=True, comment="开具时间"),
        sa.Column(
            "issued_by",
            app.models.base.UUIDBin16(length=16),
            nullable=True,
            comment="开具操作员 user id（财务）",
        ),
        sa.Column("reject_reason", sa.Text(), nullable=True, comment="驳回原因"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["saas_orders.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", name="uq_saas_invoices_order_id"),
    )
    op.create_index(op.f("ix_saas_invoices_user_id"), "saas_invoices", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_saas_invoices_user_id"), table_name="saas_invoices")
    op.drop_table("saas_invoices")
