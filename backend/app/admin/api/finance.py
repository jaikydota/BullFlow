from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_finance_user
from app.admin.schemas.common import success
from app.admin.services import finance_admin, saas_ops

from app.models.user import User

router = APIRouter(prefix="/finance", tags=["财务系统"])


@router.get("/summary")
async def finance_summary_api(
    _a: User = Depends(get_current_finance_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data=await finance_admin.finance_summary_kpis(db))


@router.get("/monthly")
async def finance_monthly(
    _a: User = Depends(get_current_finance_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data={"monthly_revenue": await saas_ops.finance_monthly(db)})
