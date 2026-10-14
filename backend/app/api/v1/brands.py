from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.brand import BrandCreate, BrandResponse, BrandUpdate
from app.schemas.common import PaginatedData, success
from app.services.brand_service import BrandService

router = APIRouter(prefix="/brands", tags=["品牌管理"])


@router.get("")
async def list_brands(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = BrandService(db)
    items, total = await svc.list_(current_user.id, page=page, page_size=page_size)
    data = [BrandResponse.model_validate(i).model_dump() for i in items]
    return success(data=PaginatedData.create(items=data, total=total, page=page, page_size=page_size).model_dump())


@router.post("")
async def create_brand(
    body: BrandCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = BrandService(db)
    obj = await svc.create(current_user.id, body)
    return success(data=BrandResponse.model_validate(obj).model_dump())


@router.get("/{id}")
async def get_brand(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = BrandService(db)
    obj = await svc.get_by_id(id, current_user.id)
    return success(data=BrandResponse.model_validate(obj).model_dump())


@router.put("/{id}")
async def update_brand(
    id: str,
    body: BrandUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = BrandService(db)
    obj = await svc.update(id, current_user.id, body)
    return success(data=BrandResponse.model_validate(obj).model_dump())


@router.delete("/{id}")
async def delete_brand(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = BrandService(db)
    await svc.delete(id, current_user.id)
    return success(message="已删除")
