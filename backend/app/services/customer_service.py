from __future__ import annotations

from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.services.base_service import BaseCRUDService


class CustomerService(BaseCRUDService[Customer]):
    def __init__(self, db: AsyncSession):
        super().__init__(db, Customer)

    async def list_(
        self,
        user_id: str,
        *,
        page: int = 1,
        page_size: int = 20,
        search: str | None = None,
        extra_filters: list | None = None,
    ) -> tuple[list[Customer], int]:
        filters = extra_filters or []
        if search and search.strip():
            keyword = f"%{search.strip()}%"
            filters.append(
                or_(
                    Customer.name.ilike(keyword),
                    Customer.company_name.ilike(keyword),
                    Customer.industry.ilike(keyword),
                    Customer.region.ilike(keyword),
                    Customer.contact_email.ilike(keyword),
                )
            )
        return await super().list_(user_id, page=page, page_size=page_size, extra_filters=filters)
