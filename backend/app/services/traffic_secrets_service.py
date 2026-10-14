from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_platform import TrafficSecretItem


async def list_enabled(db: AsyncSession) -> list[TrafficSecretItem]:
    stmt = (
        select(TrafficSecretItem)
        .where(TrafficSecretItem.is_enabled.is_(True))
        .order_by(TrafficSecretItem.sort_order.asc(), TrafficSecretItem.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)
