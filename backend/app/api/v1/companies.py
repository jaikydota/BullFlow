from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import ConflictError
from app.models.user import User
from app.schemas.common import PaginatedData, success
from app.schemas.company import CompanyCreate, CompanyResponse, CompanyUpdate
from app.services.company_service import CompanyService

router = APIRouter(prefix="/companies", tags=["公司信息"])


@router.get("")
async def list_companies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = CompanyService(db)
    items, total = await svc.list_(current_user.id, page=page, page_size=page_size)
    data = [CompanyResponse.model_validate(i).model_dump() for i in items]
    return success(data=PaginatedData.create(items=data, total=total, page=page, page_size=page_size).model_dump())


@router.post("")
async def create_company(
    body: CompanyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = CompanyService(db)
    _, total = await svc.list_(current_user.id, page=1, page_size=1)
    if total >= 1:
        raise ConflictError("每个账户只能创建 1 个企业，如需修改请直接编辑现有企业")
    obj = await svc.create(current_user.id, body)
    return success(data=CompanyResponse.model_validate(obj).model_dump())


@router.get("/{id}")
async def get_company(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = CompanyService(db)
    obj = await svc.get_by_id(id, current_user.id)
    return success(data=CompanyResponse.model_validate(obj).model_dump())


@router.put("/{id}")
async def update_company(
    id: str,
    body: CompanyUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = CompanyService(db)
    obj = await svc.update(id, current_user.id, body)
    return success(data=CompanyResponse.model_validate(obj).model_dump())


@router.delete("/{id}")
async def delete_company(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = CompanyService(db)
    await svc.delete(id, current_user.id)
    return success(message="已删除")
