from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.saas import SaasOrder


async def finance_summary_kpis(db: AsyncSession) -> dict:
    try:
        pending = (
            await db.scalar(
                select(func.count()).select_from(SaasOrder).where(SaasOrder.status == "pending")
            )
            or 0
        )

        amt = SaasOrder.amount_cents
        paid_rev = func.coalesce(SaasOrder.actual_revenue_cents, amt)

        total_paid = int(
            await db.scalar(select(func.coalesce(func.sum(paid_rev), 0)).where(SaasOrder.status == "paid"))
            or 0
        )

        paid_count = int(
            await db.scalar(
                select(func.count()).select_from(SaasOrder).where(SaasOrder.status == "paid")
            )
            or 0
        )

        refunded_cents = int(
            await db.scalar(select(func.coalesce(func.sum(amt), 0)).where(SaasOrder.status == "refunded"))
            or 0
        )

        return {
            "total_revenue_yuan": total_paid // 100,
            "paid_orders": int(paid_count),
            "pending_orders": int(pending),
            "refunded_orders_amount_yuan": refunded_cents // 100,
        }
    except SQLAlchemyError:
        await db.rollback()
        return {
            "total_revenue_yuan": 0,
            "paid_orders": 0,
            "pending_orders": 0,
            "refunded_orders_amount_yuan": 0,
        }
