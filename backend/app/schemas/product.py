from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.core.time import UtcModel


class ProductCreate(BaseModel):
    company_id: str | None = None
    brand_id: str | None = None
    name: str = Field(..., max_length=255)
    description: str | None = None
    category: str | None = Field(None, max_length=100)
    features: list | None = None
    specifications: dict | None = None
    cover_image: str | None = Field(None, max_length=500)
    price_info: str | None = Field(None, max_length=255)
    tags: list[str] | None = None

    @model_validator(mode="after")
    def _normalize_image_paths(self) -> ProductCreate:
        from app.services.minio_service import url_to_path
        self.cover_image = url_to_path(self.cover_image)
        return self


class ProductUpdate(BaseModel):
    brand_id: str | None = None
    name: str | None = Field(None, max_length=255)
    description: str | None = None
    category: str | None = Field(None, max_length=100)
    features: list | None = None
    specifications: dict | None = None
    cover_image: str | None = Field(None, max_length=500)
    price_info: str | None = Field(None, max_length=255)
    tags: list[str] | None = None

    @model_validator(mode="after")
    def _normalize_image_paths(self) -> ProductUpdate:
        from app.services.minio_service import url_to_path
        self.cover_image = url_to_path(self.cover_image)
        return self


class ProductResponse(UtcModel):
    id: str
    user_id: str
    company_id: str | None = None
    brand_id: str | None = None
    name: str
    description: str | None = None
    category: str | None = None
    features: Any = None
    specifications: Any = None
    cover_image: str | None = None
    price_info: str | None = None
    tags: Any = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _transform_image_paths(self) -> ProductResponse:
        from app.services.minio_service import path_to_url
        self.cover_image = path_to_url(self.cover_image)
        return self
