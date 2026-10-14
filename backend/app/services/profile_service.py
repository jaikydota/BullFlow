"""用户企业档案服务。

在 LLM 对话时，将用户录入的公司/品牌/产品/客户/案例信息组装成一段结构化文本，
注入 system prompt，使模型无需额外工具调用即可回答"我公司叫什么"等基础问题。

查询策略：
- 并发执行五张表的查询，控制在固定上限内避免 prompt 过大
- 只包含非空字段，避免向模型发送无意义的 None
- 若用户尚未录入任何信息，返回空字符串（不修改 prompt）
"""
from __future__ import annotations

import asyncio
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand import Brand
from app.models.case import Case
from app.models.company import Company
from app.models.customer import Customer
from app.models.product import Product

# 每类最多取几条（防止 prompt 过大）
_MAX_COMPANIES = 3
_MAX_BRANDS = 5
_MAX_PRODUCTS = 10
_MAX_CUSTOMERS = 10
_MAX_CASES = 8


async def build_user_profile_text(user_id: str, db: AsyncSession) -> str:
    """查询用户的企业档案并返回可注入 prompt 的文本块。

    返回空字符串表示用户尚未录入任何档案信息。
    """
    companies, brands, products, customers, cases = await asyncio.gather(
        _fetch_companies(user_id, db),
        _fetch_brands(user_id, db),
        _fetch_products(user_id, db),
        _fetch_customers(user_id, db),
        _fetch_cases(user_id, db),
    )

    if not any([companies, brands, products, customers, cases]):
        return ""

    lines: list[str] = ["【企业档案】"]

    if companies:
        for c in companies:
            lines.append("")
            lines.extend(company_lines(c))

    if brands:
        lines.append("\n## 品牌")
        for b in brands:
            lines.extend(brand_lines(b))

    if products:
        lines.append("\n## 产品")
        for p in products:
            lines.extend(product_lines(p))

    if customers:
        lines.append("\n## 客户")
        for cu in customers:
            lines.extend(customer_lines(cu))

    if cases:
        lines.append("\n## 案例")
        for ca in cases:
            lines.extend(case_lines(ca))

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# 单条记录格式化器（build_user_profile_text 与「自定义参考内容」共用，保证风格一致）
# ---------------------------------------------------------------------------

def company_lines(c: Any) -> list[str]:
    out = [f"## 公司：{c.name}"]
    if c.industry:
        out.append(f"- 行业：{c.industry}")
    if c.description:
        out.append(f"- 简介：{c.description}")
    if c.website:
        out.append(f"- 官网：{c.website}")
    if c.contact_email:
        out.append(f"- 联系邮箱：{c.contact_email}")
    if c.contact_phone:
        out.append(f"- 联系电话：{c.contact_phone}")
    if c.address:
        out.append(f"- 地址：{c.address}")
    return out


def brand_lines(b: Any) -> list[str]:
    head = f"- **{b.name}**"
    if b.slogan:
        head += f"（{b.slogan}）"
    out = [head]
    if b.description:
        out.append(f"  简介：{b.description}")
    if b.brand_color:
        out.append(f"  主色：{b.brand_color}")
    if b.tags:
        out.append(f"  标签：{', '.join(str(t) for t in b.tags)}")
    if b.guidelines:
        preview = b.guidelines[:200].rstrip()
        out.append(f"  规范：{preview}{'…' if len(b.guidelines) > 200 else ''}")
    return out


def product_lines(p: Any) -> list[str]:
    head = f"- **{p.name}**"
    if p.category:
        head += f"（{p.category}）"
    if p.price_info:
        head += f" — {p.price_info}"
    out = [head]
    if p.description:
        out.append(f"  描述：{p.description}")
    if p.features:
        out.append(f"  卖点：{', '.join(str(f) for f in p.features)}")
    if p.specifications:
        specs = "; ".join(f"{k}: {v}" for k, v in _iter_specs(p.specifications))
        if specs:
            out.append(f"  规格：{specs}")
    return out


def customer_lines(cu: Any) -> list[str]:
    head = f"- **{cu.name}**"
    if cu.company_name:
        head += f"（{cu.company_name}）"
    if cu.region:
        head += f" · {cu.region}"
    out = [head]
    if cu.industry:
        out.append(f"  行业：{cu.industry}")
    if cu.description:
        out.append(f"  背景：{cu.description}")
    if cu.contact_email:
        out.append(f"  邮箱：{cu.contact_email}")
    if cu.contact_phone:
        out.append(f"  电话：{cu.contact_phone}")
    if cu.tags:
        out.append(f"  标签：{', '.join(str(t) for t in cu.tags)}")
    return out


def case_lines(ca: Any) -> list[str]:
    head = f"- **{ca.title}**"
    if ca.category:
        head += f"（{ca.category}）"
    if ca.industry:
        head += f" · {ca.industry}"
    out = [head]
    # summary 优先，其次 description；content 通常很长，不注入
    overview = ca.summary or ca.description
    if overview:
        preview = overview[:300].rstrip()
        out.append(f"  摘要：{preview}{'…' if len(overview) > 300 else ''}")
    if ca.tags:
        out.append(f"  标签：{', '.join(str(t) for t in ca.tags)}")
    return out


# ---------------------------------------------------------------------------
# 内部查询辅助
# ---------------------------------------------------------------------------

async def _fetch_companies(user_id: str, db: AsyncSession) -> list[Company]:
    q = select(Company).where(Company.user_id == user_id).order_by(Company.created_at.asc()).limit(_MAX_COMPANIES)
    return list((await db.execute(q)).scalars().all())


async def _fetch_brands(user_id: str, db: AsyncSession) -> list[Brand]:
    q = select(Brand).where(Brand.user_id == user_id).order_by(Brand.created_at.asc()).limit(_MAX_BRANDS)
    return list((await db.execute(q)).scalars().all())


async def _fetch_products(user_id: str, db: AsyncSession) -> list[Product]:
    q = select(Product).where(Product.user_id == user_id).order_by(Product.created_at.asc()).limit(_MAX_PRODUCTS)
    return list((await db.execute(q)).scalars().all())


async def _fetch_customers(user_id: str, db: AsyncSession) -> list[Customer]:
    q = select(Customer).where(Customer.user_id == user_id).order_by(Customer.created_at.asc()).limit(_MAX_CUSTOMERS)
    return list((await db.execute(q)).scalars().all())


async def _fetch_cases(user_id: str, db: AsyncSession) -> list[Case]:
    q = select(Case).where(Case.user_id == user_id).order_by(Case.created_at.asc()).limit(_MAX_CASES)
    return list((await db.execute(q)).scalars().all())


def _iter_specs(specs: Any):
    """安全迭代 specifications 字段（JSON 对象）的键值对。"""
    if not isinstance(specs, dict):
        return
    for k, v in specs.items():
        if v is not None and str(v).strip():
            yield k, v
