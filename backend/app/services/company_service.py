from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.services.base_service import BaseCRUDService


class CompanyService(BaseCRUDService[Company]):
    def __init__(self, db: AsyncSession):
        super().__init__(db, Company)
