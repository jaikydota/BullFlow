from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.core.time import UtcModel


class FeedbackCreate(BaseModel):
    """提交反馈请求体。"""

    category: str = Field("suggestion", pattern="^(suggestion|bug|other)$", description="反馈类型")
    content: str = Field(..., min_length=1, max_length=5000, description="反馈正文")
    images: list[str] | None = Field(None, description="截图 URL 列表（来自 /uploads/image）")
    contact: str | None = Field(None, max_length=255, description="联系方式（可选）")


class FeedbackResponse(UtcModel):
    """反馈响应体（用户端可见自己的处理状态与回复）。"""

    id: str
    category: str
    content: str
    images: list[str] | None = None
    contact: str | None = None
    status: str
    reply: str | None = None
    replied_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
