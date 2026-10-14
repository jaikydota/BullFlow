from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class GeneratedContent(Base, BaseMixin):
    __tablename__ = "generated_contents"

    type: Mapped[str] = mapped_column(
        Enum("article", "image", "video", name="content_gen_type"),
        nullable=False,
        comment="内容类型（article=文章，image=图片，video=视频）"
    )
    title: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="内容标题"
    )
    content: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="生成的文本内容（文章类填充此字段）"
    )
    description: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="发布用简介/文案（生成时 LLM 产出，发布时自动填入描述）"
    )
    tags: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="发布用标签/话题关键词列表（生成时 LLM 产出，发布时自动填入标签）"
    )
    file_path: Mapped[str | None] = mapped_column(
        String(1000), nullable=True,
        comment="生成的媒体文件存储路径（图片/视频类填充此字段；多图/混编时存首图作封面）"
    )
    media_urls: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="多图 URL 列表：图文分离=全部图；图文混编=正文内嵌图的有序列表"
    )
    layout: Mapped[str | None] = mapped_column(
        String(20), nullable=True,
        comment="形态：mixed=图文混编文章 / dynamic=图文分离图片动态 / NULL=普通"
    )
    thumbnail_path: Mapped[str | None] = mapped_column(
        String(1000), nullable=True, comment="缩略图路径"
    )
    prompt: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="生成时使用的提示词"
    )
    model_provider: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="使用的模型服务商"
    )
    model_name: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="使用的具体模型名称"
    )
    parameters: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="生成参数快照（JSON，如尺寸、风格、步数等）"
    )
    status: Mapped[str] = mapped_column(
        Enum("pending", "generating", "completed", "failed", name="gen_status"),
        server_default="pending",
        comment="生成状态（pending=待生成，generating=生成中，completed=已完成，failed=失败）"
    )
    publish_status: Mapped[str] = mapped_column(
        Enum("draft", "ready", "published", name="publish_status"),
        server_default="draft",
        comment="发布状态（draft=草稿，ready=待发布，published=已发布）"
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="定时发布时间"
    )
    error_message: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="生成失败时的错误信息"
    )
