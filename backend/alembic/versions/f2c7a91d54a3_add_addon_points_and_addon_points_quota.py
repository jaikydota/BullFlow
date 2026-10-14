"""add_addon_points_to_subscription_and_points_quota_to_addon

Revision ID: f2c7a91d54a3
Revises: e9b1c4a82367, a7e2b4f9c1d3
Create Date: 2026-05-25 12:00:00.000000

业务背景：
- 增量包的积分 = 永久有效（不随订阅周期清零）→ SaasSubscription 新增 `addon_points` 余额列
- 套餐内的积分 = 每个订阅日重置（已用清零、配额按 plan 重置）
- SaasAddon 增加 `points_quota` 列以表达"该积分类增量包发放多少积分"

迁移同时执行一次性数据搬迁：把现有未用完的套餐配额（points_quota - points_used）
搬到新增的 addon_points，避免引入"订阅日清零"规则后老用户感知积分凭空消失。

兼任 merge migration —— 同时合并 e9b1c4a82367（通知广播）与
a7e2b4f9c1d3（代理表）两条已存在的分叉头。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f2c7a91d54a3"
down_revision: Union[str, Sequence[str], None] = ("e9b1c4a82367", "a7e2b4f9c1d3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. SaasSubscription: 加 addon_points 列（永久积分余额）
    op.add_column(
        "saas_subscriptions",
        sa.Column(
            "addon_points",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment="永久有效的增量包积分余额（不随订阅周期清零）",
        ),
    )

    # 2. SaasAddon: 加 points_quota 列（积分类增量包的"每份发放积分数"）
    op.add_column(
        "saas_addons",
        sa.Column(
            "points_quota",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment="积分类增量包发放的积分数；非积分类型固定为 0",
        ),
    )

    # 3. 一次性数据搬迁：把现有 active 订阅未用完的套餐配额搬到 addon_points
    op.execute(
        """
        UPDATE saas_subscriptions
           SET addon_points = addon_points + GREATEST(points_quota - points_used, 0)
         WHERE status = 'active'
        """
    )


def downgrade() -> None:
    op.drop_column("saas_addons", "points_quota")
    op.drop_column("saas_subscriptions", "addon_points")
