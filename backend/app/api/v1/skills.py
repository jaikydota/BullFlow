from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import NotFoundError
from app.models.user import User
from app.schemas.common import success
from app.services import skill_service

router = APIRouter(prefix="/skills", tags=["内容生成 skill 池"])


@router.get("")
async def list_skills(
    content_type: str | None = Query(None, description="article / image / video / chat"),
    platform: str | None = Query(None, description="平台 code，过滤适用该平台的 skill"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出启用的 skill（供生成页 / 对话选择）。"""
    items = await skill_service.list_active_skills(db, content_type=content_type, platform=platform)
    # 列表不下发完整 prompt，避免无谓体积；选中后由后端按 skill_id 注入
    data = [
        {k: v for k, v in skill_service.skill_to_dict(s).items() if k != "prompt"}
        for s in items
    ]
    return success(data={"items": data})


@router.get("/{skill_id}")
async def get_skill(
    skill_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    skill = await skill_service.get_active_skill(skill_id, db)
    if not skill:
        raise NotFoundError("skill 不存在或已下架")
    return success(data=skill_service.skill_to_dict(skill))
