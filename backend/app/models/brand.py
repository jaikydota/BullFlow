from __future__ import annotations

from sqlalchemy import JSON, Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin, UUIDBin16


class Brand(Base, BaseMixin):
    __tablename__ = "brands"

    company_id: Mapped[str | None] = mapped_column(
        UUIDBin16, ForeignKey("companies.id", ondelete="SET NULL"),
        nullable=True, comment="所属公司 ID"
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="品牌名称"
    )
    description: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="品牌简介"
    )
    logo_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="Logo 图片 URL"
    )
    brand_color: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="品牌主色（十六进制色值，如 #FF5A00）"
    )
    tags: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="自定义标签列表"
    )
    slogan: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="品牌口号"
    )
    guidelines: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="品牌使用规范（长文本，如视觉/语言风格指南）"
    )
    is_locked: Mapped[bool] = mapped_column(
        Boolean, server_default="0", comment="是否锁定，锁定后禁止编辑"
    )
