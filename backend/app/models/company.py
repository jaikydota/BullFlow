from __future__ import annotations

from sqlalchemy import JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class Company(Base, BaseMixin):
    __tablename__ = "companies"

    name: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="公司名称"
    )
    description: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="公司简介"
    )
    industry: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="所属行业"
    )
    website: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="官方网站 URL"
    )
    logo: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="公司 Logo 图片 URL"
    )
    contact_email: Mapped[str | None] = mapped_column(
        String(255), nullable=True, comment="公司联系邮箱"
    )
    contact_phone: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="公司联系电话"
    )
    address: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="公司地址"
    )
    extra_info: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="扩展信息（JSON，预留字段，当前未使用）"
    )
