from __future__ import annotations

from pydantic import BaseModel, Field


class AdminLoginBody(BaseModel):
    # 账号：邮箱或已绑定的手机号
    account: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1)


class AdminUserBrief(BaseModel):
    id: str
    email: str
    nickname: str | None = None
    avatar: str | None = None
    role: str
    status: str

    model_config = {"from_attributes": True}


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: AdminUserBrief
