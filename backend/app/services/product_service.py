from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.services.base_service import BaseCRUDService


class ProductService(BaseCRUDService[Product]):
    def __init__(self, db: AsyncSession):
        super().__init__(db, Product)
