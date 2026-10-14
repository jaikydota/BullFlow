from __future__ import annotations

from pydantic import BaseModel, Field


class AdminSkillPayload(BaseModel):
    slug: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=500)
    prompt: str = Field(..., min_length=1)
    content_types: list[str] = Field(default_factory=list, description="article/image/video/chat 子集")
    platforms: list[str] = Field(default_factory=list, description="平台 code 列表，空=通用")
    category: str | None = Field(None, max_length=50)
    icon: str | None = Field(None, max_length=50)
    source_url: str | None = Field(None, max_length=500)
    status: str = Field("active", pattern=r"^(active|inactive)$")
    recommended: bool = Field(False, description="是否推荐（用户端高亮展示）")
    sort_order: int = Field(0, ge=0)
