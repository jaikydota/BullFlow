from __future__ import annotations

from sqlalchemy import BigInteger, Enum, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class Image(Base, BaseMixin):
    __tablename__ = "images"

    title: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="图片标题"
    )
    file_name: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="原始文件名"
    )
    file_path: Mapped[str] = mapped_column(
        String(1000), nullable=False, comment="存储路径（对象存储 key 或本地相对路径）"
    )
    thumbnail_path: Mapped[str | None] = mapped_column(
        String(1000), nullable=True, comment="缩略图路径"
    )
    file_size: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True, comment="文件大小（字节）"
    )
    width: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="图片宽度（像素）"
    )
    height: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="图片高度（像素）"
    )
    mime_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="MIME 类型（如 image/jpeg）"
    )
    source: Mapped[str] = mapped_column(
        Enum("upload", "generated", name="image_source"),
        server_default="upload",
        comment="来源（upload=用户上传，generated=AI 生成）"
    )
    category: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="图片分类"
    )
    tags: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="自定义标签列表"
    )
    milvus_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="图像向量在 Milvus 中的记录 ID（用于图搜图）"
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="completed",
        comment="处理状态（pending→processing→completed/failed）"
    )
    error_message: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="处理失败时的错误信息"
    )
