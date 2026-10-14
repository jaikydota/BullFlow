from __future__ import annotations

from sqlalchemy import JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class ChatSession(Base, BaseMixin):
    __tablename__ = "chat_sessions"

    title: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="对话标题，默认取首条消息前 80 字"
    )
    model_provider: Mapped[str | None] = mapped_column(
        String(50), nullable=True,
        comment="会话默认 LLM 服务商（azure / volcengine / aliyun），单条请求可覆盖"
    )
    model_name: Mapped[str | None] = mapped_column(
        String(100), nullable=True,
        comment="会话默认模型名称，单条请求可覆盖；为空时使用全局默认模型"
    )
    system_prompt: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="会话级自定义系统提示词；为空时 Agent 使用内置默认提示词"
    )
    metadata_: Mapped[dict | None] = mapped_column(
        "metadata", JSON, nullable=True,
        comment="扩展元数据，预留字段，当前未使用"
    )
