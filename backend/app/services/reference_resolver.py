"""内容生成「参考内容」解析器。

把前端传来的结构化 `reference` 配置解析为：注入生成的参考文本 + 是否检索文档。
三种模式：
- auto（检索知识库，默认）：注入企业档案（5 维度）；文章额外允许按需检索知识库文档。
- custom（自定义）：只用用户勾选的 5 维度 item + ≤2 篇文档全文，不检索。
- none（不参考）：空。

兼容：reference 为空时回退旧 brand_info 文本（老调用 / 未迁移路径）。
所有查询按 user_id 隔离（多租户）。
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand import Brand
from app.models.case import Case
from app.models.company import Company
from app.models.customer import Customer
from app.models.product import Product
from app.services import profile_service
from app.services.profile_service import build_user_profile_text
from app.services.reference_service import _build_documents

logger = logging.getLogger(__name__)

# 自定义模式最多参考的完整文档数
MAX_CUSTOM_DOCS = 2


class ResolvedReference:
    """参考内容解析结果。"""

    def __init__(self, reference_text: str = "", use_knowledge: bool = False) -> None:
        self.reference_text = reference_text
        self.use_knowledge = use_knowledge


async def resolve_generation_reference(
    reference: Any,
    user_id: str,
    db: AsyncSession,
    *,
    allow_doc_retrieval: bool,
    fallback_brand_info: str | None = None,
) -> ResolvedReference:
    """解析参考内容配置。

    Args:
        reference: 前端结构化配置 {mode, company_ids, brand_ids, ...}；None 时回退 brand_info。
        allow_doc_retrieval: auto 模式是否允许检索知识库文档（文章 True，图片/视频 False）。
        fallback_brand_info: reference 为空时的旧 brand_info 文本。
    """
    # 兼容：未传 reference → 用旧 brand_info 文本，并保留旧默认检索行为
    # （文章端点旧默认 use_knowledge=True；图片/视频 allow_doc_retrieval=False 故无影响）
    if not isinstance(reference, dict):
        return ResolvedReference(
            reference_text=(fallback_brand_info or "").strip(),
            use_knowledge=allow_doc_retrieval,
        )

    mode = reference.get("mode") or "auto"

    if mode == "none":
        return ResolvedReference(reference_text="", use_knowledge=False)

    if mode == "custom":
        # 文档全文仅对文章有意义；图片/视频不注入文档（避免提示词膨胀/超长）
        text = await _build_custom_reference(
            reference, user_id, db, include_documents=allow_doc_retrieval,
        )
        return ResolvedReference(reference_text=text, use_knowledge=False)

    # auto：注入企业档案；是否检索文档由调用方（文章 True）决定
    profile = await build_user_profile_text(user_id, db)
    return ResolvedReference(reference_text=profile, use_knowledge=allow_doc_retrieval)


def _ids(reference: dict, key: str) -> list[str]:
    v = reference.get(key)
    return [str(x) for x in v if x] if isinstance(v, list) else []


async def _fetch_by_ids(model: Any, ids: list[str], user_id: str, db: AsyncSession) -> list[Any]:
    if not ids:
        return []
    rows = (
        await db.execute(
            select(model).where(model.id.in_(ids), model.user_id == user_id)
        )
    ).scalars().all()
    # 按前端传入顺序排列
    by_id = {str(r.id): r for r in rows}
    return [by_id[i] for i in ids if i in by_id]


async def _build_custom_reference(
    reference: dict, user_id: str, db: AsyncSession, *, include_documents: bool = True,
) -> str:
    """自定义模式：按勾选的 ID 拼 5 维度 item + ≤2 篇文档全文（文档可关）。"""
    companies = await _fetch_by_ids(Company, _ids(reference, "company_ids"), user_id, db)
    brands = await _fetch_by_ids(Brand, _ids(reference, "brand_ids"), user_id, db)
    products = await _fetch_by_ids(Product, _ids(reference, "product_ids"), user_id, db)
    customers = await _fetch_by_ids(Customer, _ids(reference, "customer_ids"), user_id, db)
    cases = await _fetch_by_ids(Case, _ids(reference, "case_ids"), user_id, db)

    blocks: list[str] = []

    profile_lines: list[str] = []
    if companies:
        for c in companies:
            profile_lines.append("")
            profile_lines.extend(profile_service.company_lines(c))
    if brands:
        profile_lines.append("\n## 品牌")
        for b in brands:
            profile_lines.extend(profile_service.brand_lines(b))
    if products:
        profile_lines.append("\n## 产品")
        for p in products:
            profile_lines.extend(profile_service.product_lines(p))
    if customers:
        profile_lines.append("\n## 客户")
        for cu in customers:
            profile_lines.extend(profile_service.customer_lines(cu))
    if cases:
        profile_lines.append("\n## 案例")
        for ca in cases:
            profile_lines.extend(profile_service.case_lines(ca))

    if profile_lines:
        blocks.append("【参考内容】" + "\n".join(profile_lines))

    # 文档全文（最多 2 篇，复用 reference_service 的整篇拼接 + 字符预算）
    doc_ids = _ids(reference, "document_ids")[:MAX_CUSTOM_DOCS] if include_documents else []
    if doc_ids:
        try:
            doc_text, _ = await _build_documents(doc_ids, user_id, db)
            if doc_text:
                blocks.append(doc_text)
        except Exception:
            logger.warning("自定义参考内容：文档全文拼接失败", exc_info=True)

    return "\n\n".join(blocks)
