"""DeveloperApp 相关 Pydantic schema。"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TenantCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    webhook_url: str | None = None
    description: str | None = None


class TenantUpdateRequest(BaseModel):
    name: str | None = None
    webhook_url: str | None = None
    status: str | None = Field(None, pattern=r"^(active|disabled)$")
    description: str | None = None


class TenantResponse(BaseModel):
    id: str
    name: str
    app_id: str
    webhook_url: str | None = None
    status: str
    description: str | None = None
    created_by_admin_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TenantCreateResponse(TenantResponse):
    """新建/重置秘钥时附带的明文凭据（仅展示一次）。

    用默认空字符串，让 model_validate(orm_obj) 不报「字段缺失」；之后由 route 手动赋值。
    """

    app_key_plaintext: str = ""
    webhook_secret_plaintext: str = ""
