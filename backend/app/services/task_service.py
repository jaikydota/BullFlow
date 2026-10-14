from __future__ import annotations

from datetime import datetime

from app.core.time import utcnow

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.task import Task


class TaskService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_task(self, user_id: str, task_type: str, input_params: dict | None = None) -> Task:
        task = Task(
            user_id=user_id,
            type=task_type,
            status="pending",
            input_params=input_params,
        )
        self.db.add(task)
        await self.db.flush()
        await self.db.refresh(task)
        return task

    async def update_status(
        self,
        task_id: str,
        status: str,
        *,
        progress: int | None = None,
        result: dict | None = None,
        error_message: str | None = None,
    ) -> Task:
        task = await self._get(task_id)
        task.status = status
        if progress is not None:
            task.progress = progress
        if result is not None:
            task.result = result
        if error_message is not None:
            task.error_message = error_message
        if status == "running" and task.started_at is None:
            task.started_at = utcnow()
        if status in ("completed", "failed", "cancelled"):
            task.completed_at = utcnow()
        await self.db.flush()
        await self.db.refresh(task)
        return task

    async def get_task(self, task_id: str, user_id: str) -> Task:
        task = await self._get(task_id)
        if task.user_id != user_id:
            raise ForbiddenError("无权查看此任务")
        return task

    async def list_tasks(
        self,
        user_id: str,
        page: int = 1,
        page_size: int = 20,
        type_: str | None = None,
        status: str | None = None,
    ) -> tuple[list[Task], int]:
        filters = [Task.user_id == user_id]
        if type_:
            filters.append(Task.type == type_)
        if status:
            filters.append(Task.status == status)
        count_q = select(func.count()).select_from(Task).where(*filters)
        total = (await self.db.execute(count_q)).scalar() or 0
        q = (
            select(Task)
            .where(*filters)
            .order_by(Task.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        items = list((await self.db.execute(q)).scalars().all())
        return items, total

    async def _get(self, task_id: str) -> Task:
        result = await self.db.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if task is None:
            raise NotFoundError("任务不存在")
        return task
