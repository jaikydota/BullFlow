from __future__ import annotations

from sqlalchemy import JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class Customer(Base, BaseMixin):
    __tablename__ = "customers"

    name: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="客户联系人姓名"
    )
    company_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True, comment="客户所属公司名称"
    )
    region: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="所在地区或国家"
    )
    industry: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="所属行业"
    )
    contact_email: Mapped[str | None] = mapped_column(
        String(255), nullable=True, comment="联系邮箱"
    )
    contact_phone: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="联系电话"
    )
    description: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="客户背景描述"
    )
    contact_info: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="扩展联系方式（JSON，如社交账号、地址、微信等）"
    )
    preferences: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="客户偏好与需求（JSON，用于个性化营销）"
    )
    tags: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="自定义标签列表"
    )
