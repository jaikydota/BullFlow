from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.common import PaginatedData, success
from app.schemas.document import TaskResponse
from app.services.task_service import TaskService

router = APIRouter(prefix="/tasks", tags=["异步任务"])


@router.get("")
async def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    type: str | None = Query(None),
    status: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = TaskService(db)
    items, total = await svc.list_tasks(current_user.id, page=page, page_size=page_size, type_=type, status=status)
    data = [TaskResponse.model_validate(i).model_dump() for i in items]
    return success(data=PaginatedData.create(items=data, total=total, page=page, page_size=page_size).model_dump())


@router.get("/{task_id}")
async def get_task(task_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    task = await svc.get_task(task_id, current_user.id)
    return success(data=TaskResponse.model_validate(task).model_dump())


@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    svc = TaskService(db)
    task = await svc.get_task(task_id, current_user.id)
    if task.status in ("pending", "running"):
        await svc.update_status(task_id, "cancelled")
        await db.commit()  # service 仅 flush，必须在返回前 commit，否则前端随后拉列表读到旧数据
    return success(message="已取消")
