from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDBin16, _generate_uuid7


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    __table_args__ = (
        Index("idx_chunks_doc", "document_id", "chunk_index"),
    )

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键，UUID v7"
    )
    user_id: Mapped[str] = mapped_column(
        UUIDBin16, nullable=False, index=True, comment="所属用户 ID，多租户隔离键"
    )
    document_id: Mapped[str] = mapped_column(
        UUIDBin16, ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False, index=True, comment="所属文档 ID"
    )
    chunk_index: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="在文档中的顺序编号（从 0 开始）"
    )
    content: Mapped[str] = mapped_column(
        Text, nullable=False, comment="chunk 原始文本内容"
    )
    token_count: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="chunk 的 token 数"
    )
    heading_context: Mapped[str | None] = mapped_column(
        String(1000), nullable=True,
        comment="所在章节路径（如 '第1章 > 1.1 概述'），用于增强检索上下文"
    )
    metadata_: Mapped[dict | None] = mapped_column(
        "metadata", JSON, nullable=True, comment="其他扩展元数据（预留字段）"
    )
    milvus_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="在 Milvus 向量库中的记录 ID"
    )
    es_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="在 Elasticsearch 全文索引中的记录 ID"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="入库时间"
    )
