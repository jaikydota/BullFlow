from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.case import CaseCreate, CaseResponse, CaseUpdate
from app.schemas.common import PaginatedData, success
from app.services.case_service import CaseService

router = APIRouter(prefix="/cases", tags=["案例库"])


@router.get("")
async def list_cases(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=500), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    svc = CaseService(db)
    items, total = await svc.list_(current_user.id, page=page, page_size=page_size)
    data = [CaseResponse.model_validate(i).model_dump() for i in items]
    return success(data=PaginatedData.create(items=data, total=total, page=page, page_size=page_size).model_dump())


@router.post("")
async def create_case(body: CaseCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    svc = CaseService(db)
    obj = await svc.create(current_user.id, body)
    return success(data=CaseResponse.model_validate(obj).model_dump())


@router.get("/{id}")
async def get_case(id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    svc = CaseService(db)
    obj = await svc.get_by_id(id, current_user.id)
    return success(data=CaseResponse.model_validate(obj).model_dump())


@router.put("/{id}")
async def update_case(id: str, body: CaseUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    svc = CaseService(db)
    obj = await svc.update(id, current_user.id, body)
    return success(data=CaseResponse.model_validate(obj).model_dump())


@router.delete("/{id}")
async def delete_case(id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    svc = CaseService(db)
    await svc.delete(id, current_user.id)
    return success(message="已删除")
