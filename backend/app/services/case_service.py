from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case
from app.services.base_service import BaseCRUDService


class CaseService(BaseCRUDService[Case]):
    def __init__(self, db: AsyncSession):
        super().__init__(db, Case)
