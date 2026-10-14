from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.common import PaginatedData, success
from app.schemas.feedback import FeedbackCreate, FeedbackResponse
from app.services.feedback_service import FeedbackService

router = APIRouter(prefix="/feedbacks", tags=["意见反馈"])


@router.post("")
async def create_feedback(
    body: FeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """提交一条反馈（文字 + 截图 URL 列表）。"""
    svc = FeedbackService(db)
    obj = await svc.create(current_user.id, body)
    return success(data=FeedbackResponse.model_validate(obj).model_dump(mode="json"))


@router.get("")
async def list_feedbacks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """当前用户的反馈历史（含处理状态与管理员回复），按时间倒序。"""
    svc = FeedbackService(db)
    items, total = await svc.list_(current_user.id, page=page, page_size=page_size)
    data = [FeedbackResponse.model_validate(i).model_dump(mode="json") for i in items]
    return success(
        data=PaginatedData.create(items=data, total=total, page=page, page_size=page_size).model_dump()
    )
