"""admin 登录 / 修改自己密码 / 自己资料。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.database import get_db
from tlf_app.core.dependencies import get_current_admin
from tlf_app.core.exceptions import AuthenticationError
from tlf_app.core.security import hash_password, verify_password
from tlf_app.models.admin_user import AdminUser
from tlf_app.schemas.common import ok
from tlf_app.services import admin_auth

router = APIRouter()


class LoginRequest(BaseModel):
    # 不用 EmailStr —— email-validator 会拒绝 .local / .test 等保留 TLD
    # （admin@tlf.local 这种 seed 邮箱会被它判为"reserved name"，登录直接 422）
    email: str = Field(..., min_length=3, max_length=190)
    password: str = Field(..., min_length=1)


@router.post("/auth/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    token, user = await admin_auth.login(db, body.email, body.password)
    return ok({
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
        },
    })


@router.get("/auth/me")
async def get_me(user: AdminUser = Depends(get_current_admin)):
    return ok({
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "status": user.status,
    })


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=8, description="至少 8 位")


@router.post("/auth/change-password")
async def change_password(
    body: ChangePasswordRequest,
    user: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.old_password, user.password_hash):
        raise AuthenticationError("旧密码错误")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return ok({"changed": True})
