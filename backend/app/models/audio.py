from __future__ import annotations

from sqlalchemy import BigInteger, Enum, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class Audio(Base, BaseMixin):
    __tablename__ = "audios"

    title: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="音频标题"
    )
    file_name: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="原始文件名"
    )
    file_path: Mapped[str] = mapped_column(
        String(1000), nullable=False, comment="存储路径（对象存储 key 或本地相对路径）"
    )
    file_size: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True, comment="文件大小（字节）"
    )
    mime_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="MIME 类型（如 audio/mp3）"
    )
    duration: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="音频时长（秒）"
    )
    language: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="语言代码（如 zh / en），用于 ASR 转录"
    )
    transcript: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="ASR 转录全文"
    )
    segments: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="带时间戳的分段文本（JSON 数组）"
    )
    source: Mapped[str] = mapped_column(
        Enum("upload", name="audio_source"),
        server_default="upload",
        comment="来源（upload=用户上传）"
    )
    category: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="音频分类"
    )
    document_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True,
        comment="关联的转录文档 ID（documents 表），用于 RAG 检索"
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="pending",
        comment="处理状态（pending→processing→completed/failed）"
    )
    error_message: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="处理失败时的错误信息"
    )
