"""add_credit_transactions_table

Revision ID: a3d7e92f5c81
Revises: f2c7a91d54a3
Create Date: 2026-05-26 09:00:00.000000

新增积分流水表：每次扣分（chat / article / image / video / distribution）或
加分（注册赠送 / 订单成单 / 管理员调整）都会插入一行，作为「计费明细」页
和审计的来源。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a3d7e92f5c81"
down_revision: Union[str, None] = "f2c7a91d54a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "credit_transactions",
        sa.Column("id", sa.BINARY(16), primary_key=True, comment="主键 UUID v7"),
        sa.Column("user_id", sa.BINARY(16), nullable=False, comment="租户用户 ID"),
        sa.Column(
            "direction",
            sa.Enum("debit", "credit", name="credit_tx_direction"),
            nullable=False,
            comment="方向：debit=扣分 / credit=加分",
        ),
        sa.Column("amount", sa.Integer(), nullable=False, comment="积分数（正数）"),
        sa.Column(
            "source",
            sa.Enum("subscription", "addon", "mixed", name="credit_tx_source"),
            nullable=False,
            comment="扣自哪个池",
        ),
        sa.Column("biz_type", sa.String(32), nullable=False, comment="业务类型"),
        sa.Column("biz_ref_type", sa.String(64), nullable=True, comment="关联资源表名"),
        sa.Column("biz_ref_id", sa.String(64), nullable=True, comment="关联资源 ID"),
        sa.Column("model_id", sa.String(100), nullable=True, comment="模型 ID 快照"),
        sa.Column("unit_price", sa.Float(), nullable=True, comment="单价快照（元/单位）"),
        sa.Column("units", sa.Float(), nullable=True, comment="计费数量"),
        sa.Column(
            "balance_after_sub",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment="扣后套餐积分余额",
        ),
        sa.Column(
            "balance_after_addon",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment="扣后增量包积分余额",
        ),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_credit_transactions_user_id", "credit_transactions", ["user_id"]
    )
    op.create_index(
        "idx_credit_tx_user_created",
        "credit_transactions",
        ["user_id", "created_at"],
    )
    op.create_index(
        "idx_credit_tx_user_biz",
        "credit_transactions",
        ["user_id", "biz_type"],
    )


def downgrade() -> None:
    op.drop_index("idx_credit_tx_user_biz", table_name="credit_transactions")
    op.drop_index("idx_credit_tx_user_created", table_name="credit_transactions")
    op.drop_index("ix_credit_transactions_user_id", table_name="credit_transactions")
    op.drop_table("credit_transactions")
