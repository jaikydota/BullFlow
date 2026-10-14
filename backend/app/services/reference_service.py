"""对话「挂载参考素材」服务。

把前端结构化的引用（文档 / 图片 / 品牌 / 产品）解析成喂给 LLM 的上下文：

- 文档：取出该文档全部 chunk（已是 Markdown）按 chunk_index 顺序拼接为整篇正文，
  直接注入上下文，AI 无需再主动 knowledge_search。超出字符预算时截断并提示 AI
  可用 knowledge_search 检索剩余部分。
- 图片：解析出公网 URL 列表，由 chat_graph 构造多模态 HumanMessage 真正传给视觉模型。
- 品牌 / 产品：注入结构化资料（简介 / 口号 / 规范、卖点 / 规格 / 价格等）。

所有查询都按 user_id 隔离（多租户）。返回的 `display_refs` 回存到 user 消息的
attachments 字段，供前端气泡渲染引用卡片（不再把 `[参考文档]：xxx` 前缀塞进 content）。
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
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.image import Image
from app.models.product import Product
from app.services import profile_service
from app.services.minio_service import path_to_url

logger = logging.getLogger(__name__)

# 所有挂载文档拼接后注入上下文的总字符预算（超出截断 + 提示 AI 检索补全）。
# gpt-5.4-mini 上下文较大，4 万字约 2~3 万 token，给回答与历史留足余量。
REFERENCE_DOC_CHAR_BUDGET = 40000


class ReferencePayload:
    """参考素材解析结果。"""

    def __init__(self) -> None:
        self.context_text: str = ""          # 注入到用户问题前的「参考资料」文本块
        self.image_urls: list[str] = []      # 多模态图片公网 URL
        self.display_refs: list[dict] = []   # 回存 attachments / 前端气泡卡片


def _normalize_refs(references: Any) -> list[dict]:
    """容错地把入参规整成 list[dict]，过滤掉缺 kind/id 的脏数据。"""
    if not isinstance(references, list):
        return []
    out: list[dict] = []
    for r in references:
        if isinstance(r, dict) and r.get("kind") and r.get("id"):
            out.append(r)
    return out


async def build_reference_payload(
    references: Any,
    user_id: str,
    db: AsyncSession,
) -> ReferencePayload:
    """把结构化引用解析为上下文文本 + 图片 URL + 展示用引用。"""
    payload = ReferencePayload()
    refs = _normalize_refs(references)
    if not refs:
        return payload

    doc_ids = [str(r["id"]) for r in refs if r.get("kind") == "document"]
    image_ids = [str(r["id"]) for r in refs if r.get("kind") == "image"]
    brand_ids = [str(r["id"]) for r in refs if r.get("kind") == "brand"]
    product_ids = [str(r["id"]) for r in refs if r.get("kind") == "product"]
    company_ids = [str(r["id"]) for r in refs if r.get("kind") == "company"]
    customer_ids = [str(r["id"]) for r in refs if r.get("kind") == "customer"]
    case_ids = [str(r["id"]) for r in refs if r.get("kind") == "case"]

    blocks: list[str] = []

    # ---- 文档：整篇拼接注入 ----
    if doc_ids:
        doc_text, doc_display = await _build_documents(doc_ids, user_id, db)
        if doc_text:
            blocks.append(doc_text)
        payload.display_refs.extend(doc_display)

    # ---- 图片：收集公网 URL（多模态） ----
    if image_ids:
        urls, img_display = await _build_images(image_ids, user_id, db)
        payload.image_urls.extend(urls)
        payload.display_refs.extend(img_display)

    # ---- 品牌：结构化资料 ----
    if brand_ids:
        brand_text, brand_display = await _build_brands(brand_ids, user_id, db)
        if brand_text:
            blocks.append(brand_text)
        payload.display_refs.extend(brand_display)

    # ---- 产品：结构化资料 ----
    if product_ids:
        product_text, product_display = await _build_products(product_ids, user_id, db)
        if product_text:
            blocks.append(product_text)
        payload.display_refs.extend(product_display)

    # ---- 公司 / 客户 / 案例：结构化资料（复用 profile_service 格式化器） ----
    if company_ids:
        text, display = await _build_simple(
            Company, company_ids, user_id, db,
            kind="company", name_attr="name", header="[参考公司]",
            fmt=profile_service.company_lines,
        )
        if text:
            blocks.append(text)
        payload.display_refs.extend(display)
    if customer_ids:
        text, display = await _build_simple(
            Customer, customer_ids, user_id, db,
            kind="customer", name_attr="name", header="[参考客户]",
            fmt=profile_service.customer_lines,
        )
        if text:
            blocks.append(text)
        payload.display_refs.extend(display)
    if case_ids:
        text, display = await _build_simple(
            Case, case_ids, user_id, db,
            kind="case", name_attr="title", header="[参考案例]",
            fmt=profile_service.case_lines,
        )
        if text:
            blocks.append(text)
        payload.display_refs.extend(display)

    if blocks:
        payload.context_text = "\n\n".join(blocks)
    return payload


async def _build_simple(
    model: Any, ids: list[str], user_id: str, db: AsyncSession, *,
    kind: str, name_attr: str, header: str, fmt: Any,
) -> tuple[str, list[dict]]:
    """公司/客户/案例通用：按 ID 查询 → profile_service 格式化器拼文本 + display_refs。"""
    rows = (
        await db.execute(
            select(model).where(model.id.in_(ids), model.user_id == user_id)
        )
    ).scalars().all()
    row_map = {str(r.id): r for r in rows}

    parts: list[str] = []
    display: list[dict] = []
    for i in ids:
        r = row_map.get(i)
        if r is None:
            continue
        label = getattr(r, name_attr, None) or "未命名"
        # case 用 title 字段、其余用 name；display 统一给前端可读字段
        if name_attr == "title":
            display.append({"kind": kind, "id": i, "title": label})
        else:
            display.append({"kind": kind, "id": i, "name": label})
        parts.append("\n".join(fmt(r)))

    if not parts:
        return "", display
    return f"{header}\n\n" + "\n\n".join(parts), display


async def _build_documents(
    doc_ids: list[str], user_id: str, db: AsyncSession
) -> tuple[str, list[dict]]:
    """取每篇文档的全部 chunk 按序拼接，受总字符预算约束。"""
    # 一次查出标题（按 user 隔离）
    docs = (
        await db.execute(
            select(Document).where(
                Document.id.in_(doc_ids), Document.user_id == user_id
            )
        )
    ).scalars().all()
    doc_map = {str(d.id): d for d in docs}

    parts: list[str] = []
    display: list[dict] = []
    used = 0
    truncated_any = False

    # 保持前端传入顺序
    for did in doc_ids:
        doc = doc_map.get(did)
        if doc is None:
            continue
        title = doc.title or doc.file_name or "未命名文档"
        # 带上 file_type，前端预览组件据此正确判定格式（勿依赖 title 扩展名）
        display.append(
            {"kind": "document", "id": did, "title": title, "fileType": doc.file_type}
        )

        if used >= REFERENCE_DOC_CHAR_BUDGET:
            truncated_any = True
            continue

        chunks = (
            await db.execute(
                select(DocumentChunk.content)
                .where(
                    DocumentChunk.document_id == did,
                    DocumentChunk.user_id == user_id,
                )
                .order_by(DocumentChunk.chunk_index)
            )
        ).scalars().all()
        full = "\n\n".join(c for c in chunks if c)
        if not full.strip():
            continue

        remaining = REFERENCE_DOC_CHAR_BUDGET - used
        if len(full) > remaining:
            full = full[:remaining]
            truncated_any = True
        used += len(full)
        parts.append(f"《{title}》\n{full}")

    if not parts:
        return "", display

    header = (
        "[参考文档全文]（以下是用户挂载文档的完整内容，请优先依据这些内容回答；"
        "无需再调用 knowledge_search 检索这些文档）"
    )
    body = "\n\n---\n\n".join(parts)
    if truncated_any:
        body += (
            "\n\n[注意：以上文档内容因过长已被截断，若需要文档其余部分，"
            "请调用 knowledge_search 工具检索补全。]"
        )
    return f"{header}\n\n{body}", display


async def _build_images(
    image_ids: list[str], user_id: str, db: AsyncSession
) -> tuple[list[str], list[dict]]:
    """解析图片公网 URL（优先原图，便于视觉模型识别）。"""
    images = (
        await db.execute(
            select(Image).where(Image.id.in_(image_ids), Image.user_id == user_id)
        )
    ).scalars().all()
    img_map = {str(i.id): i for i in images}

    urls: list[str] = []
    display: list[dict] = []
    for iid in image_ids:
        img = img_map.get(iid)
        if img is None:
            continue
        # 视觉识别用原图（file_path），缩略图仅作前端卡片展示
        url = path_to_url(img.file_path)
        thumb = path_to_url(img.thumbnail_path) or url
        if url:
            urls.append(url)
        display.append(
            {
                "kind": "image",
                "id": iid,
                "title": img.title or img.file_name or "图片",
                "url": thumb,       # 卡片缩略图
                "fullUrl": url,     # 点开 MediaPreview 用原图
            }
        )
    return urls, display


async def _build_brands(
    brand_ids: list[str], user_id: str, db: AsyncSession
) -> tuple[str, list[dict]]:
    brands = (
        await db.execute(
            select(Brand).where(Brand.id.in_(brand_ids), Brand.user_id == user_id)
        )
    ).scalars().all()
    brand_map = {str(b.id): b for b in brands}

    parts: list[str] = []
    display: list[dict] = []
    for bid in brand_ids:
        b = brand_map.get(bid)
        if b is None:
            continue
        display.append({"kind": "brand", "id": bid, "name": b.name})
        lines = [f"品牌名称：{b.name}"]
        if b.slogan:
            lines.append(f"品牌口号：{b.slogan}")
        if b.description:
            lines.append(f"品牌简介：{b.description}")
        if b.guidelines:
            lines.append(f"品牌规范：{b.guidelines}")
        if b.tags:
            lines.append(f"标签：{'、'.join(str(t) for t in b.tags)}")
        parts.append("\n".join(lines))

    if not parts:
        return "", display
    header = "[参考品牌]（请使用以下品牌的风格、口吻与规范进行创作/回答）"
    return f"{header}\n\n" + "\n\n".join(parts), display


async def _build_products(
    product_ids: list[str], user_id: str, db: AsyncSession
) -> tuple[str, list[dict]]:
    products = (
        await db.execute(
            select(Product).where(
                Product.id.in_(product_ids), Product.user_id == user_id
            )
        )
    ).scalars().all()
    product_map = {str(p.id): p for p in products}

    # 关联品牌名（用于展示 brandName）
    brand_id_set = {str(p.brand_id) for p in products if p.brand_id}
    brand_name_map: dict[str, str] = {}
    if brand_id_set:
        brands = (
            await db.execute(
                select(Brand).where(
                    Brand.id.in_(brand_id_set), Brand.user_id == user_id
                )
            )
        ).scalars().all()
        brand_name_map = {str(b.id): b.name for b in brands}

    parts: list[str] = []
    display: list[dict] = []
    for pid in product_ids:
        p = product_map.get(pid)
        if p is None:
            continue
        brand_name = brand_name_map.get(str(p.brand_id)) if p.brand_id else None
        display.append(
            {"kind": "product", "id": pid, "name": p.name, "brandName": brand_name}
        )
        lines = [f"产品名称：{p.name}"]
        if brand_name:
            lines.append(f"所属品牌：{brand_name}")
        if p.category:
            lines.append(f"产品分类：{p.category}")
        if p.description:
            lines.append(f"产品描述：{p.description}")
        if p.features:
            lines.append(f"核心卖点：{'、'.join(str(f) for f in p.features)}")
        if p.specifications and isinstance(p.specifications, dict):
            spec = "；".join(f"{k}：{v}" for k, v in p.specifications.items())
            lines.append(f"技术规格：{spec}")
        if p.price_info:
            lines.append(f"价格信息：{p.price_info}")
        parts.append("\n".join(lines))

    if not parts:
        return "", display
    header = "[参考产品]（请围绕以下目标产品的卖点与规格进行创作/回答）"
    return f"{header}\n\n" + "\n\n".join(parts), display
