from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user
from app.admin.schemas.common import success
from app.admin.schemas.skill_admin import AdminSkillPayload
from app.admin.services import skill_ops

from app.models.user import User

router = APIRouter(prefix="/skills", tags=["内容生成 skill 池"])


@router.get("")
async def list_skills(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data={"items": await skill_ops.list_skills(db)})


@router.post("")
async def create_skill(
    body: AdminSkillPayload,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data={"item": await skill_ops.create_skill(db, body, operator_id=str(admin.id))})


@router.put("/{skill_id}")
async def update_skill(
    skill_id: str,
    body: AdminSkillPayload,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data={"item": await skill_ops.update_skill(db, skill_id, body, operator_id=str(admin.id))})


@router.delete("/{skill_id}")
async def delete_skill(
    skill_id: str,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data=await skill_ops.delete_skill(db, skill_id, operator_id=str(admin.id)))
