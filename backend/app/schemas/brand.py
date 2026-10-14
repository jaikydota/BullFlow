from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.core.time import UtcModel


class BrandCreate(BaseModel):
    company_id: str | None = None
    name: str = Field(..., max_length=255)
    description: str | None = None
    logo_url: str | None = Field(None, max_length=500)
    brand_color: str | None = Field(None, max_length=50)
    tags: list[str] | None = None
    slogan: str | None = Field(None, max_length=500)
    guidelines: str | None = None

    @model_validator(mode="after")
    def _normalize_image_paths(self) -> BrandCreate:
        from app.services.minio_service import url_to_path
        self.logo_url = url_to_path(self.logo_url)
        return self


class BrandUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    description: str | None = None
    logo_url: str | None = Field(None, max_length=500)
    brand_color: str | None = Field(None, max_length=50)
    tags: list[str] | None = None
    slogan: str | None = Field(None, max_length=500)
    guidelines: str | None = None
    is_locked: bool | None = None

    @model_validator(mode="after")
    def _normalize_image_paths(self) -> BrandUpdate:
        from app.services.minio_service import url_to_path
        self.logo_url = url_to_path(self.logo_url)
        return self


class BrandResponse(UtcModel):
    id: str
    user_id: str
    company_id: str | None = None
    name: str
    description: str | None = None
    logo_url: str | None = None
    brand_color: str | None = None
    tags: Any = None
    slogan: str | None = None
    guidelines: str | None = None
    is_locked: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _transform_image_paths(self) -> BrandResponse:
        from app.services.minio_service import path_to_url
        self.logo_url = path_to_url(self.logo_url)
        return self
