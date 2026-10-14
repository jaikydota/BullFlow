from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseCRUDService(Generic[ModelT]):
    """Reusable CRUD service with multi-tenant isolation."""

    def __init__(self, db: AsyncSession, model_class: type[ModelT]):
        self.db = db
        self.model = model_class

    async def get_by_id(self, id_: str, user_id: str) -> ModelT:
        result = await self.db.execute(
            select(self.model).where(self.model.id == id_, self.model.user_id == user_id)
        )
        obj = result.scalar_one_or_none()
        if obj is None:
            raise NotFoundError(f"{self.model.__tablename__} 不存在")
        return obj

    async def list_(
        self,
        user_id: str,
        *,
        page: int = 1,
        page_size: int = 20,
        extra_filters: list | None = None,
    ) -> tuple[list[ModelT], int]:
        base_filter = [self.model.user_id == user_id]
        if extra_filters:
            base_filter.extend(extra_filters)

        count_q = select(func.count()).select_from(self.model).where(*base_filter)
        total = (await self.db.execute(count_q)).scalar() or 0

        q = (
            select(self.model)
            .where(*base_filter)
            .order_by(self.model.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        items = list((await self.db.execute(q)).scalars().all())
        return items, total

    async def create(self, user_id: str, data: BaseModel) -> ModelT:
        obj = self.model(user_id=user_id, **data.model_dump(exclude_unset=True))
        self.db.add(obj)
        await self.db.flush()
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def update(self, id_: str, user_id: str, data: BaseModel) -> ModelT:
        obj = await self.get_by_id(id_, user_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        await self.db.flush()
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def delete(self, id_: str, user_id: str) -> None:
        obj = await self.get_by_id(id_, user_id)
        await self.db.delete(obj)
        await self.db.flush()
        await self.db.commit()
