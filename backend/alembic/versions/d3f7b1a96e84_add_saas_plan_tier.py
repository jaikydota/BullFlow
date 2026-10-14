"""saas_plans 加 tier 档位：列表排序 + 升级判断（只能升级到更高档位）

Revision ID: d3f7b1a96e84
Revises: b3f9a2c5d1e8
Create Date: 2026-06-18

档位字段：整数，越大越高档（free=0）。
- C 端价格表 / 后台套餐列表均按 tier 升序排序（同档再按月付价）；
- C 端升降级：禁止切换到比当前更低档位的套餐（自助降级走客服）。

回填策略：免费套餐（月付价=0）tier=0；付费套餐按月付价升序依次 1,2,3…，
保证迁移后即有"价格越高档位越高"的合理初始档位，DBA 可后续在后台调整。
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d3f7b1a96e84"
down_revision: Union[str, None] = "b3f9a2c5d1e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "saas_plans",
        sa.Column(
            "tier",
            sa.Integer(),
            server_default="0",
            nullable=False,
            comment="档位，越大越高档（free=0）；排序 + 升级判断用",
        ),
    )
    # 回填初始档位：免费套餐=0，付费套餐按月付价升序 1,2,3…
    op.execute("SET @rank := 0")
    op.execute(
        "UPDATE saas_plans "
        "SET tier = IF(monthly_price_cents = 0, 0, (@rank := @rank + 1)) "
        "ORDER BY monthly_price_cents ASC, name ASC"
    )


def downgrade() -> None:
    op.drop_column("saas_plans", "tier")
