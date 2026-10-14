from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.admin.dependencies import get_current_console_user
from app.admin.schemas.auth import AdminLoginBody, AdminLoginResponse, AdminUserBrief
from app.admin.schemas.common import success
from app.admin.services.auth_admin import authenticate_admin
from app.core.security import create_access_token

from app.models.user import User

router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/login")
async def admin_login(body: AdminLoginBody, db: AsyncSession = Depends(get_db)):
    user = await authenticate_admin(db, body.account, body.password)
    expire_minutes = settings.ADMIN_JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    access = create_access_token(user.id, extra={"role": user.role}, expire_minutes=expire_minutes)
    data = AdminLoginResponse(
        access_token=access,
        expires_in=expire_minutes * 60,
        user=AdminUserBrief.model_validate(user),
    ).model_dump()
    return success(data=data)


@router.get("/me")
async def admin_me(admin: User = Depends(get_current_console_user)):
    return success(data=AdminUserBrief.model_validate(admin).model_dump())
