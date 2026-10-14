from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.common import PaginatedData, success
from app.schemas.customer import CustomerCreate, CustomerResponse, CustomerUpdate
from app.services.customer_service import CustomerService

router = APIRouter(prefix="/customers", tags=["目标客户"])


@router.get("")
async def list_customers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    search: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = CustomerService(db)
    items, total = await svc.list_(current_user.id, page=page, page_size=page_size, search=search)
    data = [CustomerResponse.model_validate(i).model_dump() for i in items]
    return success(data=PaginatedData.create(items=data, total=total, page=page, page_size=page_size).model_dump())


@router.post("")
async def create_customer(body: CustomerCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    svc = CustomerService(db)
    obj = await svc.create(current_user.id, body)
    return success(data=CustomerResponse.model_validate(obj).model_dump())


@router.get("/{id}")
async def get_customer(id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    svc = CustomerService(db)
    obj = await svc.get_by_id(id, current_user.id)
    return success(data=CustomerResponse.model_validate(obj).model_dump())


@router.put("/{id}")
async def update_customer(id: str, body: CustomerUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    svc = CustomerService(db)
    obj = await svc.update(id, current_user.id, body)
    return success(data=CustomerResponse.model_validate(obj).model_dump())


@router.delete("/{id}")
async def delete_customer(id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    svc = CustomerService(db)
    await svc.delete(id, current_user.id)
    return success(message="已删除")
