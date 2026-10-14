from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class AdminUserCreateBody(BaseModel):
    # 邮箱 / 手机号二选一必填（service 层校验）；只填手机号时自动生成占位邮箱
    email: EmailStr | None = None
    password: str = Field(..., min_length=8, max_length=128)
    role: str = Field("user", pattern=r"^(super_admin|admin|user)$")
    nickname: str | None = Field(None, max_length=100)
    # 可选手机号；国内 11 位，service 层校验格式并归一化为 '86'+11 位入库
    phone: str | None = Field(None, max_length=32)


class AdminUserPatchBody(BaseModel):
    status: str | None = Field(None, pattern=r"^(active|disabled)$")
    role: str | None = Field(None, pattern=r"^(super_admin|admin|user)$")
    nickname: str | None = Field(None, max_length=100)
    password: str | None = Field(None, min_length=8, max_length=128)
    # 邮箱：None=不改；非空合法邮箱=校验唯一性后更新（邮箱不可置空，DB NOT NULL）
    email: EmailStr | None = None
    # 传空串=清空手机号；非空=校验+归一化后更新；None=不改
    phone: str | None = Field(None, max_length=32)


class AdminUserDetailOut(BaseModel):
    id: str
    email: str
    phone: str | None = None
    nickname: str | None
    role: str
    status: str
    language: str
    created_by: str | None
    created_at: object | None = None
    updated_at: object | None = None

    model_config = {"from_attributes": True}
