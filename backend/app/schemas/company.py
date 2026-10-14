from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.core.time import UtcModel


class CompanyCreate(BaseModel):
    name: str = Field(..., max_length=255)
    description: str | None = None
    industry: str | None = Field(None, max_length=100)
    website: str | None = Field(None, max_length=500)
    logo: str | None = Field(None, max_length=500)
    contact_email: str | None = Field(None, max_length=255)
    contact_phone: str | None = Field(None, max_length=50)
    address: str | None = None
    extra_info: dict | None = None

    @model_validator(mode="after")
    def _normalize_image_paths(self) -> CompanyCreate:
        from app.services.minio_service import url_to_path
        self.logo = url_to_path(self.logo)
        return self


class CompanyUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    description: str | None = None
    industry: str | None = Field(None, max_length=100)
    website: str | None = Field(None, max_length=500)
    logo: str | None = Field(None, max_length=500)
    contact_email: str | None = Field(None, max_length=255)
    contact_phone: str | None = Field(None, max_length=50)
    address: str | None = None
    extra_info: dict | None = None

    @model_validator(mode="after")
    def _normalize_image_paths(self) -> CompanyUpdate:
        from app.services.minio_service import url_to_path
        self.logo = url_to_path(self.logo)
        return self


class CompanyResponse(UtcModel):
    id: str
    user_id: str
    name: str
    description: str | None = None
    industry: str | None = None
    website: str | None = None
    logo: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    extra_info: Any = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _transform_image_paths(self) -> CompanyResponse:
        from app.services.minio_service import path_to_url
        self.logo = path_to_url(self.logo)
        return self
