from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.models.product import Product
from app.models.user import User
from app.schemas.common import PaginatedData, success
from app.schemas.product import ProductCreate, ProductResponse, ProductUpdate
from app.services.product_service import ProductService

router = APIRouter(prefix="/products", tags=["产品管理"])


@router.get("")
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    brand_id: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = ProductService(db)
    extra = []
    if brand_id:
        extra.append(Product.brand_id == brand_id)
    items, total = await svc.list_(current_user.id, page=page, page_size=page_size, extra_filters=extra)
    data = [ProductResponse.model_validate(i).model_dump() for i in items]
    return success(data=PaginatedData.create(items=data, total=total, page=page, page_size=page_size).model_dump())


@router.post("")
async def create_product(body: ProductCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    svc = ProductService(db)
    obj = await svc.create(current_user.id, body)
    return success(data=ProductResponse.model_validate(obj).model_dump())


@router.get("/{id}")
async def get_product(id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    svc = ProductService(db)
    obj = await svc.get_by_id(id, current_user.id)
    return success(data=ProductResponse.model_validate(obj).model_dump())


@router.put("/{id}")
async def update_product(id: str, body: ProductUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    svc = ProductService(db)
    obj = await svc.update(id, current_user.id, body)
    return success(data=ProductResponse.model_validate(obj).model_dump())


@router.delete("/{id}")
async def delete_product(id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    svc = ProductService(db)
    await svc.delete(id, current_user.id)
    return success(message="已删除")
