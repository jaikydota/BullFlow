from __future__ import annotations

from sqlalchemy import JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin, UUIDBin16


class Case(Base, BaseMixin):
    __tablename__ = "cases"

    title: Mapped[str] = mapped_column(
        String(500), nullable=False, comment="案例标题"
    )
    description: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="案例简介（一段话摘要）"
    )
    content: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="案例详细内容（长文本）"
    )
    summary: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="AI 生成摘要或人工编写摘要"
    )
    category: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="案例分类（如出海营销 / 品牌推广等）"
    )
    industry: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="所属行业"
    )
    brand_id: Mapped[str | None] = mapped_column(
        UUIDBin16, nullable=True, comment="关联品牌 ID"
    )
    product_id: Mapped[str | None] = mapped_column(
        UUIDBin16, nullable=True, comment="关联产品 ID"
    )
    tags: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="自定义标签列表"
    )
    cover_image: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="案例封面图 URL"
    )
    attachments: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="关联附件列表（JSON URL 数组，如图片、文档等）"
    )
