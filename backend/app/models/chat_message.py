from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDBin16, _generate_uuid7


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("idx_messages_session", "session_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键，UUID v7"
    )
    user_id: Mapped[str] = mapped_column(
        UUIDBin16, nullable=False, index=True, comment="消息归属用户 ID，多租户隔离键"
    )
    session_id: Mapped[str] = mapped_column(
        UUIDBin16, ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False, comment="所属对话会话 ID"
    )
    role: Mapped[str] = mapped_column(
        Enum("user", "assistant", "system", name="message_role"),
        nullable=False,
        comment="发言角色（user=用户，assistant=AI 助手，system=系统）"
    )
    content: Mapped[str] = mapped_column(
        Text, nullable=False, comment="消息正文"
    )
    content_type: Mapped[str] = mapped_column(
        Enum("text", "image", "video", "mixed", name="content_type"),
        server_default="text",
        comment="内容类型（text=纯文本；image/video/mixed 预留多模态扩展）"
    )
    attachments: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="附件列表（预留字段，供未来图片/文件消息使用，当前未启用）"
    )
    token_count: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="消息 token 数（预留，当前未统计）"
    )
    context_chunks: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="本条助手消息引用的知识库片段列表，每条消息独立保存以便溯源"
    )
    tts_audio_url: Mapped[str | None] = mapped_column(
        String(512), nullable=True,
        comment="TTS 朗读音频 MinIO 路径（128k AAC .m4a），NULL 表示尚未生成"
    )
    generation_results: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="本条消息触发的内容生成记录列表 [{generation_id, type, status, title, preview_info}]"
    )
    distribution_results: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="本条消息触发的分发任务列表 [{task_id, channels, status, content_title}]"
    )
    export_results: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="本条消息触发的导出记录列表 [{generation_id, format, download_url, title}]"
    )
    upload_results: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="本条消息携带的文件上传记录 [{file_category, file_name, file_id, file_url, thumbnail_url, status}]"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="消息创建时间"
    )
