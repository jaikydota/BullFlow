from __future__ import annotations

from sqlalchemy import BigInteger, Enum, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class Document(Base, BaseMixin):
    __tablename__ = "documents"
    __table_args__ = (
        Index("idx_documents_user_status", "user_id", "status"),
    )

    title: Mapped[str] = mapped_column(
        String(500), nullable=False, comment="文档显示标题"
    )
    file_name: Mapped[str] = mapped_column(
        String(500), nullable=False, comment="原始上传文件名"
    )
    file_type: Mapped[str] = mapped_column(
        String(50), nullable=False, comment="文件扩展类型（pdf / docx / txt 等）"
    )
    file_size: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True, comment="文件大小（字节）"
    )
    file_path: Mapped[str] = mapped_column(
        String(1000), nullable=False, comment="存储路径（对象存储 key 或本地相对路径）"
    )
    status: Mapped[str] = mapped_column(
        Enum("pending", "processing", "completed", "failed", name="document_status"),
        server_default="pending",
        comment="处理状态（pending=待处理，processing=解析中，completed=已就绪，failed=失败）"
    )
    chunk_count: Mapped[int] = mapped_column(
        Integer, server_default="0", comment="已切分并入库的 chunk 数量"
    )
    error_message: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="处理失败时的错误信息"
    )
    category: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="文档分类（如产品手册 / 案例 / 政策法规等）"
    )
    tags: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="自定义标签列表（JSON 字符串数组）"
    )
    source_audio_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True,
        comment="若非空，表示本文档由该音频转录生成，不在文档列表中展示"
    )
