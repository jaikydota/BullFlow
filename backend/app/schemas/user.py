from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.core.time import UtcModel


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    nickname: str | None = Field(None, max_length=100)
    role: str = Field("user", pattern=r"^(admin|user)$")
    language: str = "zh-CN"


class UserUpdate(BaseModel):
    nickname: str | None = Field(None, max_length=100)
    avatar: str | None = Field(None, max_length=500)
    password: str | None = Field(None, min_length=6, max_length=128)
    role: str | None = Field(None, pattern=r"^(super_admin|admin|user)$")
    status: str | None = Field(None, pattern=r"^(active|disabled)$")
    language: str | None = Field(None, max_length=10)

    @model_validator(mode="after")
    def _normalize_image_paths(self) -> UserUpdate:
        from app.services.minio_service import url_to_path
        self.avatar = url_to_path(self.avatar)
        return self


class UserResponse(UtcModel):
    id: str
    email: str
    phone: str | None = None
    nickname: str | None = None
    avatar: str | None = None
    role: str
    status: str
    language: str
    has_password: bool = False
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _transform_image_paths(self) -> UserResponse:
        from app.services.minio_service import path_to_url
        self.avatar = path_to_url(self.avatar)
        return self
