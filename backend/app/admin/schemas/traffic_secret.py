from __future__ import annotations

from pydantic import BaseModel, Field


class TrafficSecretCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=128)
    icon: str | None = Field(None, max_length=16, description="emoji 字符")
    icon_url: str | None = Field(None, max_length=500, description="图片地址，优先级高于 emoji")
    description: str | None = Field(None, max_length=512)
    tags: list[str] = Field(default_factory=list)
    rating: float | None = Field(None, ge=0, le=5)
    category: str | None = Field(None, max_length=64)
    source: str | None = Field(None, pattern=r"^(company|partner)$")
    price_status: str | None = Field(None, pattern=r"^(free|trial|subscription|in-app)$")
    content_markdown: str | None = None
    url: str = Field(..., min_length=1, max_length=500)
    sort_order: int = 0
    is_enabled: bool = True


class TrafficSecretUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=128)
    icon: str | None = Field(None, max_length=16)
    icon_url: str | None = Field(None, max_length=500)
    description: str | None = Field(None, max_length=512)
    tags: list[str] | None = None
    rating: float | None = Field(None, ge=0, le=5)
    category: str | None = Field(None, max_length=64)
    source: str | None = Field(None, pattern=r"^(company|partner)$")
    price_status: str | None = Field(None, pattern=r"^(free|trial|subscription|in-app)$")
    content_markdown: str | None = None
    url: str | None = Field(None, min_length=1, max_length=500)
    sort_order: int | None = None
    is_enabled: bool | None = None


class TrafficSecretOut(BaseModel):
    id: str
    title: str
    icon: str | None = None
    iconUrl: str | None = None
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    rating: float | None = None
    category: str | None = None
    source: str | None = None
    priceStatus: str | None = None
    contentMarkdown: str | None = None
    url: str
    sortOrder: int = 0
    isEnabled: bool = True
    createdAt: str | None = None
    updatedAt: str | None = None
