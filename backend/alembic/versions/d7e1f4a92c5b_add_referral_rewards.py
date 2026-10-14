"""add_referral_rewards

Revision ID: d7e1f4a92c5b
Revises: e2f8c4a6b1d3
Create Date: 2026-06-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d7e1f4a92c5b"
down_revision: Union[str, None] = "e2f8c4a6b1d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "referral_rewards",
        sa.Column("id", sa.BINARY(16), primary_key=True, comment="主键"),
        sa.Column("inviter_id", sa.BINARY(16), nullable=False, comment="邀请人 users.id"),
        sa.Column("invitee_id", sa.BINARY(16), nullable=False, comment="被邀请人 users.id"),
        sa.Column("invitation_code", sa.String(32), nullable=True, comment="注册时使用的邀请码快照"),
        sa.Column("register_granted_at", sa.DateTime(), nullable=True, comment="一阶奖励发放时间"),
        sa.Column("register_points", sa.Integer(), nullable=True, comment="一阶奖励积分快照"),
        sa.Column("recharge_granted_at", sa.DateTime(), nullable=True, comment="二阶奖励发放时间"),
        sa.Column("recharge_points", sa.Integer(), nullable=True, comment="二阶奖励积分快照"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["inviter_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invitee_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_referral_rewards_inviter_id", "referral_rewards", ["inviter_id"])
    # 一个被邀请人只归属一个邀请人
    op.create_index(
        "ix_referral_rewards_invitee_id", "referral_rewards", ["invitee_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_referral_rewards_invitee_id", table_name="referral_rewards")
    op.drop_index("ix_referral_rewards_inviter_id", table_name="referral_rewards")
    op.drop_table("referral_rewards")
