from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user, get_current_sales_user
from app.admin.schemas.common import PaginatedData, success
from app.admin.schemas.saas_admin import SalesPromote, SalesUpdate
from app.admin.services import sales_ops

from app.models.user import User

router = APIRouter(prefix="/sales", tags=["销售管理"])


# ---- 销售自助看板（销售本人，须在 /{sales_id} 之前声明）----


@router.get("/me")
async def sales_me_api(
    sales: User = Depends(get_current_sales_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data=await sales_ops.self_dashboard(db, sales))


@router.get("/me/referrals")
async def sales_me_referrals_api(
    sales: User = Depends(get_current_sales_user),
    db: AsyncSession = Depends(get_db),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    items, total = await sales_ops.sales_referrals(db, str(sales.id), page=page, page_size=page_size)
    return success(
        data=PaginatedData.create(items=items, total=total, page=page, page_size=page_size).model_dump()
    )


@router.get("")
async def list_sales_api(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    search: Annotated[str | None, Query()] = None,
):
    return success(data={"sales": await sales_ops.list_sales(db, search=search)})


@router.get("/overview")
async def sales_overview_api(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data=await sales_ops.sales_overview(db))


@router.get("/candidates")
async def sales_candidates_api(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    search: Annotated[str | None, Query()] = None,
):
    """可设为销售的候选账号（仅普通用户）。"""
    return success(data={"candidates": await sales_ops.list_candidates(db, search=search)})


@router.post("/promote")
async def promote_sales_api(
    body: SalesPromote,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """把已有普通用户设为销售。"""
    return success(data={"sales": await sales_ops.promote_sales(db, body, operator_id=str(admin.id))})


@router.put("/{sales_id}")
async def update_sales_api(
    sales_id: str,
    body: SalesUpdate,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(
        data={"sales": await sales_ops.update_sales(db, sales_id, body, operator_id=str(admin.id))}
    )


@router.delete("/{sales_id}")
async def delete_sales_api(
    sales_id: str,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data=await sales_ops.delete_sales(db, sales_id, operator_id=str(admin.id)))


@router.get("/{sales_id}/referrals")
async def sales_referrals_api(
    sales_id: str,
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    items, total = await sales_ops.sales_referrals(db, sales_id, page=page, page_size=page_size)
    return success(
        data=PaginatedData.create(items=items, total=total, page=page, page_size=page_size).model_dump()
    )
