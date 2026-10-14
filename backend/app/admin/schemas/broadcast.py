from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class BroadcastCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    message: str | None = None
    link_url: str | None = Field(None, max_length=500)
    type: str = Field("admin.broadcast", max_length=64)
    target_kind: Literal["all", "users"] = "all"
    target_user_ids: list[str] = Field(default_factory=list, description="target_kind=users 时必填")


class BroadcastOut(BaseModel):
    id: str
    title: str
    message: str | None = None
    linkUrl: str | None = None
    type: str
    targetKind: str
    targetUserIds: list[str] = Field(default_factory=list)
    totalCount: int = 0
    readCount: int = 0
    operatorId: str | None = None
    operatorName: str | None = None
    revokedAt: str | None = None
    createdAt: str | None = None
