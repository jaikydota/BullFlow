from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.core.time import UtcModel


class CaseCreate(BaseModel):
    title: str = Field(..., max_length=500)
    description: str | None = None
    content: str | None = None
    summary: str | None = None
    category: str | None = Field(None, max_length=100)
    industry: str | None = Field(None, max_length=100)
    brand_id: str | None = None
    product_id: str | None = None
    tags: list[str] | None = None
    cover_image: str | None = Field(None, max_length=500)
    attachments: list[dict] | None = None

    @model_validator(mode="after")
    def _normalize_image_paths(self) -> CaseCreate:
        from app.services.minio_service import url_to_path
        self.cover_image = url_to_path(self.cover_image)
        return self


class CaseUpdate(BaseModel):
    title: str | None = Field(None, max_length=500)
    description: str | None = None
    content: str | None = None
    summary: str | None = None
    category: str | None = Field(None, max_length=100)
    industry: str | None = Field(None, max_length=100)
    brand_id: str | None = None
    product_id: str | None = None
    tags: list[str] | None = None
    cover_image: str | None = Field(None, max_length=500)
    attachments: list[dict] | None = None

    @model_validator(mode="after")
    def _normalize_image_paths(self) -> CaseUpdate:
        from app.services.minio_service import url_to_path
        self.cover_image = url_to_path(self.cover_image)
        return self


class CaseResponse(UtcModel):
    id: str
    user_id: str
    title: str
    description: str | None = None
    content: str | None = None
    summary: str | None = None
    category: str | None = None
    industry: str | None = None
    brand_id: str | None = None
    product_id: str | None = None
    tags: Any = None
    cover_image: str | None = None
    attachments: Any = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _transform_image_paths(self) -> CaseResponse:
        from app.services.minio_service import path_to_url
        self.cover_image = path_to_url(self.cover_image)
        return self
