from __future__ import annotations

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin, UUIDBin16


class Product(Base, BaseMixin):
    __tablename__ = "products"

    company_id: Mapped[str | None] = mapped_column(
        UUIDBin16, ForeignKey("companies.id", ondelete="SET NULL"),
        nullable=True, comment="所属公司 ID"
    )
    brand_id: Mapped[str | None] = mapped_column(
        UUIDBin16, ForeignKey("brands.id", ondelete="SET NULL"),
        nullable=True, comment="所属品牌 ID"
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="产品名称"
    )
    description: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="产品描述"
    )
    category: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="产品分类"
    )
    features: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="核心卖点列表（JSON 字符串数组）"
    )
    specifications: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="技术规格参数（JSON 对象，如 {重量: '100g'}）"
    )
    cover_image: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="产品封面图 URL"
    )
    price_info: Mapped[str | None] = mapped_column(
        String(255), nullable=True, comment="价格信息文本（如 '$99 起'）"
    )
    tags: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="自定义标签列表"
    )
