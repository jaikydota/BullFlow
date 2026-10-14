from __future__ import annotations

from sqlalchemy import BigInteger, Enum, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class Video(Base, BaseMixin):
    __tablename__ = "videos"

    title: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="视频标题"
    )
    file_name: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="原始文件名"
    )
    file_path: Mapped[str] = mapped_column(
        String(1000), nullable=False, comment="存储路径（对象存储 key 或本地相对路径）"
    )
    cover_path: Mapped[str | None] = mapped_column(
        String(1000), nullable=True, comment="封面帧图片路径"
    )
    file_size: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True, comment="文件大小（字节）"
    )
    duration: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="视频时长（秒）"
    )
    resolution: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="分辨率（如 1920x1080）"
    )
    mime_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="MIME 类型（如 video/mp4）"
    )
    source: Mapped[str] = mapped_column(
        Enum("upload", "generated", name="video_source"),
        server_default="upload",
        comment="来源（upload=用户上传，generated=AI 生成）"
    )
    category: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="视频分类"
    )
    tags: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="自定义标签列表"
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="completed",
        comment="处理状态（pending→completed/failed）"
    )
    error_message: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="处理失败时的错误信息"
    )
