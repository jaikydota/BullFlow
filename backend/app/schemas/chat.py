from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.core.time import UtcModel


class CreateSessionRequest(BaseModel):
    title: str | None = None
    model_provider: str | None = None
    model_name: str | None = None
    system_prompt: str | None = None


class SessionResponse(UtcModel):
    id: str
    user_id: str
    title: str | None = None
    model_provider: str | None = None
    model_name: str | None = None
    system_prompt: str | None = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class ChatRequest(BaseModel):
    session_id: str
    message: str = Field(..., min_length=1)
    provider: str | None = None
    model: str | None = None
    stream: bool = Field(True, description="是否流式返回")
    use_knowledge: bool = Field(True, description="是否启用知识库检索")
    references: list[dict[str, Any]] | None = Field(
        None,
        description="挂载的参考素材（结构化）：每项含 kind(document/image/brand/product) + id 等字段。"
        "后端据此注入上下文 / 多模态图片，不再由前端把引用拼进 message。",
    )
    skill_id: str | None = Field(None, description="所选 skill 池预设 ID（注入 system）")


class MessageResponse(UtcModel):
    id: str
    session_id: str
    user_id: str
    role: str
    content: str
    content_type: str = "text"
    attachments: Any = None
    token_count: int | None = None
    context_chunks: Any = None
    tts_audio_url: str | None = None
    generation_results: Any = None
    distribution_results: Any = None
    export_results: Any = None
    upload_results: Any = None
    created_at: datetime
    model_config = {"from_attributes": True}
