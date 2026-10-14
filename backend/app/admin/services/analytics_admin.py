from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.saas import SaasOrder
from app.models.user import User


async def user_registrations_by_month(db: AsyncSession, *, months: int = 12) -> list[dict]:
    try:
        ym = func.date_format(User.created_at, "%Y-%m")
        stmt = (
            select(ym.label("month"), func.count(User.id).label("cnt"))
            .where(User.role == "user")
            .group_by(ym)
            .order_by(ym.desc())
            .limit(max(1, min(months, 36)))
        )
        r = await db.execute(stmt)
        out = [{"month": m, "new_users": int(c or 0)} for m, c in r.all()]
        return list(reversed(out))
    except SQLAlchemyError:
        await db.rollback()
        return []


async def orders_by_status(db: AsyncSession) -> dict[str, int]:
    try:
        stmt = select(SaasOrder.status, func.count(SaasOrder.id)).group_by(SaasOrder.status)
        r = await db.execute(stmt)
        return {str(st): int(n or 0) for st, n in r.all()}
    except SQLAlchemyError:
        await db.rollback()
        return {}
