from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user
from app.admin.schemas.common import success
from app.admin.schemas.saas_admin import FinancePromote
from app.admin.services import finance_ops

from app.models.user import User

router = APIRouter(prefix="/finance-team", tags=["财务团队"])


@router.get("")
async def list_finance_api(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    search: Annotated[str | None, Query()] = None,
):
    return success(data={"finance": await finance_ops.list_finance(db, search=search)})


@router.get("/candidates")
async def finance_candidates_api(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    search: Annotated[str | None, Query()] = None,
):
    """可设为财务的候选账号（仅普通用户）。"""
    return success(data={"candidates": await finance_ops.list_candidates(db, search=search)})


@router.post("/promote")
async def promote_finance_api(
    body: FinancePromote,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """把已有普通用户设为财务。"""
    return success(
        data={"finance": await finance_ops.promote_finance(db, body, operator_id=str(admin.id))}
    )


@router.delete("/{user_id}")
async def revoke_finance_api(
    user_id: str,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """撤销财务身份，降回普通用户。"""
    return success(data=await finance_ops.revoke_finance(db, user_id, operator_id=str(admin.id)))
