from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user
from app.admin.schemas.common import PaginatedData, success
from app.admin.schemas.feedback_admin import FeedbackPatch
from app.admin.services import feedback_ops

from app.models.user import User

router = APIRouter(prefix="/feedback", tags=["用户反馈"])


@router.get("/overview")
async def feedback_overview_api(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data=await feedback_ops.feedback_overview(db))


@router.get("")
async def list_feedback_api(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status: Annotated[str | None, Query()] = None,
    category: Annotated[str | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
):
    items, total = await feedback_ops.list_feedbacks(
        db, page=page, page_size=page_size, status=status, category=category, search=search
    )
    return success(
        data=PaginatedData.create(items=items, total=total, page=page, page_size=page_size).model_dump()
    )


@router.get("/{feedback_id}")
async def get_feedback_api(
    feedback_id: str,
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data={"feedback": await feedback_ops.get_feedback(db, feedback_id)})


@router.patch("/{feedback_id}")
async def patch_feedback_api(
    feedback_id: str,
    body: FeedbackPatch,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(
        data={
            "feedback": await feedback_ops.patch_feedback(
                db, feedback_id, body, operator_id=str(admin.id)
            )
        }
    )
