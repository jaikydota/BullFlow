from __future__ import annotations

import re

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


# E.164 不含 + 的手机号：纯数字，7~15 位（最短国家代码 1 位 + 用户号最短 6 位）
PHONE_E164_PATTERN = re.compile(r"^\d{7,15}$")
# 6 位数字验证码
SMS_CODE_PATTERN = re.compile(r"^\d{6}$")
# 密码强度：8~20 位，至少含字母 + 数字
PASSWORD_PATTERN = re.compile(r"^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-={}\[\]|:;<>,.?/~`]{8,20}$")


def _validate_phone(v: str) -> str:
    v = v.strip()
    if not PHONE_E164_PATTERN.match(v):
        raise ValueError("手机号格式错误，请使用国码+号码（如 8613800138000）")
    return v


def _validate_code(v: str) -> str:
    v = v.strip()
    if not SMS_CODE_PATTERN.match(v):
        raise ValueError("验证码必须是 6 位数字")
    return v


def _validate_password(v: str) -> str:
    if not PASSWORD_PATTERN.match(v):
        raise ValueError("密码需 8-20 位，且至少包含字母和数字")
    return v


# ============ 邮箱登录（保留现有） ============

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    captcha_ticket: str | None = Field(None, description="人机验证凭证（连续失败后要求）")


# ============ 手机号 + 密码登录 ============

class PhoneLoginRequest(BaseModel):
    phone: str = Field(..., min_length=7, max_length=15)
    password: str = Field(..., min_length=6, max_length=128)
    captcha_ticket: str | None = Field(None, description="人机验证凭证（连续失败后要求）")

    _phone_valid = field_validator("phone")(_validate_phone)


# ============ 手机号 + 验证码登录（免密） ============

class SmsLoginRequest(BaseModel):
    phone: str = Field(..., min_length=7, max_length=15)
    code: str = Field(..., min_length=6, max_length=6)
    invitation_code: str | None = Field(
        None, max_length=32, description="销售引流邀请码（可选，未注册时自动注册生效）"
    )

    _phone_valid = field_validator("phone")(_validate_phone)
    _code_valid = field_validator("code")(_validate_code)


# ============ 注册（手机号 + 验证码 + 密码） ============

class RegisterRequest(BaseModel):
    """注册仅需手机号 + 验证码；昵称与密码后续在「个人资料」补充。"""
    phone: str = Field(..., min_length=7, max_length=15)
    code: str = Field(..., min_length=6, max_length=6)
    invitation_code: str | None = Field(None, max_length=32, description="销售引流邀请码（可选）")

    _phone_valid = field_validator("phone")(_validate_phone)
    _code_valid = field_validator("code")(_validate_code)


# ============ 重置密码 ============

class ResetPasswordRequest(BaseModel):
    phone: str = Field(..., min_length=7, max_length=15)
    code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8, max_length=20)

    _phone_valid = field_validator("phone")(_validate_phone)
    _code_valid = field_validator("code")(_validate_code)
    _password_valid = field_validator("new_password")(_validate_password)


# ============ 发送验证码 ============

class SendSmsCodeRequest(BaseModel):
    phone: str = Field(..., min_length=7, max_length=15)
    purpose: str = Field(..., pattern=r"^(register|login|reset_password|change_phone)$")
    captcha_ticket: str | None = Field(None, description="人机验证凭证（始终要求）")

    _phone_valid = field_validator("phone")(_validate_phone)


# ============ 修改手机号（已登录） ============

class ChangePhoneRequest(BaseModel):
    phone: str = Field(..., min_length=7, max_length=15)
    code: str = Field(..., min_length=6, max_length=6)

    _phone_valid = field_validator("phone")(_validate_phone)
    _code_valid = field_validator("code")(_validate_code)


# ============ Token / 通用 ============

class RefreshRequest(BaseModel):
    refresh_token: str


class UserBrief(BaseModel):
    id: str
    email: str
    phone: str | None = None
    role: str
    nickname: str | None = None
    avatar: str | None = None
    has_password: bool = False

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _transform_image_paths(self) -> UserBrief:
        from app.services.minio_service import path_to_url
        self.avatar = path_to_url(self.avatar)
        return self


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserBrief


class UpdateMeRequest(BaseModel):
    nickname: str | None = Field(None, max_length=100)
    avatar: str | None = Field(None, max_length=500)
    language: str | None = Field(None, max_length=10)

    @model_validator(mode="after")
    def _normalize_image_paths(self) -> UpdateMeRequest:
        from app.services.minio_service import url_to_path
        self.avatar = url_to_path(self.avatar)
        return self


class ChangePasswordRequest(BaseModel):
    """已登录用户设置 / 修改登录密码。

    - 已设密码：需提供 ``current_password`` 校验旧密码。
    - 未设密码（手机号注册）：需提供 ``code``（发送到本人手机号的短信验证码）。
    """
    new_password: str = Field(..., min_length=8, max_length=20)
    current_password: str | None = Field(None, max_length=128)
    code: str | None = Field(None, min_length=6, max_length=6)

    _password_valid = field_validator("new_password")(_validate_password)
