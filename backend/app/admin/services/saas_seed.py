"""Seed default SaaS SKU rows if tables are empty."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import _generate_uuid7
from app.models.saas import SaasAddon, SaasPlan


async def seed_saas_catalog_if_empty(db: AsyncSession) -> None:
    n = await db.scalar(select(func.count()).select_from(SaasPlan))
    if n and n > 0:
        return

    defaults_plans = [
        dict(
            id=_generate_uuid7(),
            slug="free",
            name="Free",
            monthly_price_cents=0,
            quarterly_enabled=False,
            yearly_enabled=False,
            status="active",
            points_quota=1000,
            storage_gb=5,
            domestic_accounts=1,
            overseas_accounts=0,
            features=["基础AI生成", "单账号管理", "5GB存储", "社区支持"],
        ),
        dict(
            id=_generate_uuid7(),
            slug="pro",
            name="Pro",
            monthly_price_cents=49900,
            quarterly_enabled=True,  # 季付走默认（月付×3）
            yearly_enabled=True,
            yearly_price_cents=499900,  # 年付折扣价（月付×12=598800，立省约 16%）
            status="active",
            points_quota=10000,
            storage_gb=100,
            domestic_accounts=8,
            overseas_accounts=2,
            features=[
                "高级AI模型",
                "10个社媒账号",
                "100GB存储",
                "定时发布",
                "数据分析",
                "邮件支持",
            ],
        ),
        dict(
            id=_generate_uuid7(),
            slug="enterprise",
            name="Enterprise",
            monthly_price_cents=499900,
            quarterly_enabled=True,  # 季付走默认（月付×3）
            yearly_enabled=True,
            yearly_price_cents=4999900,  # 年付折扣价（月付×12=5998800，立省约 16%）
            status="active",
            points_quota=100000,
            storage_gb=1024,
            domestic_accounts=80,
            overseas_accounts=20,
            features=[
                "全部AI模型",
                "无限社媒账号",
                "1TB存储",
                "智能客服",
                "团队协作",
                "API接口",
                "专属客户经理",
                "私有部署选项",
            ],
        ),
    ]
    for p in defaults_plans:
        db.add(SaasPlan(**p))

    addons = [
        dict(
            id=_generate_uuid7(),
            slug="vas-points-1k",
            name="积分包 1,000",
            addon_type="points",
            unit_label="1,000 积分",
            price_cents=10000,
            status="active",
        ),
        dict(
            id=_generate_uuid7(),
            slug="vas-points-10k",
            name="积分包 10,000",
            addon_type="points",
            unit_label="10,000 积分",
            price_cents=90000,
            status="active",
        ),
        dict(
            id=_generate_uuid7(),
            slug="vas-storage-100g",
            name="存储扩容 100GB",
            addon_type="storage",
            unit_label="100GB/月",
            price_cents=5000,
            status="active",
        ),
        dict(
            id=_generate_uuid7(),
            slug="vas-storage-1t",
            name="存储扩容 1TB",
            addon_type="storage",
            unit_label="1TB/月",
            price_cents=40000,
            status="active",
        ),
        dict(
            id=_generate_uuid7(),
            slug="vas-domestic-5",
            name="国内账号包 5个",
            addon_type="domestic_account",
            unit_label="5个/月",
            price_cents=10000,
            status="active",
        ),
        dict(
            id=_generate_uuid7(),
            slug="vas-overseas-5",
            name="国外账号包 5个",
            addon_type="overseas_account",
            unit_label="5个/月",
            price_cents=15000,
            status="active",
        ),
    ]
    for a in addons:
        db.add(SaasAddon(**a))
