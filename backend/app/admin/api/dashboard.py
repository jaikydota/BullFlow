from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user
from app.admin.schemas.admin_views import DashboardSummary
from app.admin.schemas.common import success
from app.models.saas import SaasOrder
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["仪表盘"])


@router.get("/summary")
async def dashboard_summary(
    _admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """仪表盘汇总：注册用户规模、本月新增、本月已支付订单实收及待支付订单数。"""
    total_users = (
        await db.execute(select(func.count()).select_from(User).where(User.role == "user"))
    ).scalar() or 0

    total_all = (await db.execute(select(func.count()).select_from(User))).scalar() or 0

    today = date.today()
    month_start = datetime(today.year, today.month, 1)
    new_month = (
        await db.execute(
            select(func.count()).select_from(User).where(User.created_at >= month_start)
        )
    ).scalar() or 0

    pending_orders = 0
    paid_month = 0
    saas_notes: str | None = None

    try:
        pending_orders = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(SaasOrder)
                    .where(SaasOrder.status == "pending")
                )
            ).scalar()
            or 0
        )

        pm = await db.execute(
            select(
                func.coalesce(
                    func.sum(
                        func.coalesce(
                            SaasOrder.actual_revenue_cents,
                            SaasOrder.amount_cents,
                        )
                    ),
                    0,
                )
            ).where(
                SaasOrder.status == "paid",
                SaasOrder.paid_at.is_not(None),
                SaasOrder.paid_at >= month_start,
            )
        )
        raw = pm.scalar()
        paid_month = int(raw or 0)
    except SQLAlchemyError:
        await db.rollback()
        saas_notes = (
            "SaaS 订单统计不可用：请先在 backend 目录执行 `alembic upgrade head`，"
            "确保已创建 saas_orders 等表。"
        )
        pending_orders = 0
        paid_month = 0

    payload = DashboardSummary(
        tenant_total=int(total_users),
        new_tenants_this_month=int(new_month),
        revenue_this_month_cents=int(paid_month),
        pending_orders=pending_orders,
        stub=False,
    ).model_dump()
    payload["notes"] = {
        "users_table_total_rows": int(total_all),
        "hint": "来自本月已支付订单实收（分）",
        **({"saas_orders": saas_notes} if saas_notes else {}),
    }
    return success(data=payload)
