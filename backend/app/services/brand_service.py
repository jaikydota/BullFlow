from __future__ import annotations

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError
from app.models.brand import Brand
from app.services.base_service import BaseCRUDService


class BrandService(BaseCRUDService[Brand]):
    def __init__(self, db: AsyncSession):
        super().__init__(db, Brand)

    async def update(self, id_: str, user_id: str, data: BaseModel) -> Brand:
        brand = await self.get_by_id(id_, user_id)
        updates = data.model_dump(exclude_unset=True)

        if brand.is_locked:
            locked_fields = {"logo_url", "brand_color", "tags"}
            attempted = locked_fields & set(updates.keys())
            unlocking = updates.get("is_locked") is False
            if attempted and not unlocking:
                raise ForbiddenError(f"品牌已锁定，不能修改: {', '.join(attempted)}")

        for field, value in updates.items():
            setattr(brand, field, value)
        await self.db.flush()
        await self.db.commit()
        await self.db.refresh(brand)
        return brand
