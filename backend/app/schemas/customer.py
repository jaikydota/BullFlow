from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.core.time import UtcModel


class CustomerCreate(BaseModel):
    name: str = Field(..., max_length=255)
    company_name: str | None = Field(None, max_length=255)
    region: str | None = Field(None, max_length=100)
    industry: str | None = Field(None, max_length=100)
    contact_email: str | None = Field(None, max_length=255)
    contact_phone: str | None = Field(None, max_length=50)
    description: str | None = None
    contact_info: dict | None = None
    preferences: dict | None = None
    tags: list[str] | None = None


class CustomerUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    company_name: str | None = Field(None, max_length=255)
    region: str | None = Field(None, max_length=100)
    industry: str | None = Field(None, max_length=100)
    contact_email: str | None = Field(None, max_length=255)
    contact_phone: str | None = Field(None, max_length=50)
    description: str | None = None
    contact_info: dict | None = None
    preferences: dict | None = None
    tags: list[str] | None = None


class CustomerResponse(UtcModel):
    id: str
    user_id: str
    name: str
    company_name: str | None = None
    region: str | None = None
    industry: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    description: str | None = None
    contact_info: Any = None
    preferences: Any = None
    tags: Any = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
