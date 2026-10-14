"""users.seq_no：库表为 NOT NULL（且曾改为 AUTO_INCREMENT），ORM 显式插入 NULL 会触发 1048。统一在此分配下一序号。"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def allocate_user_seq_no(db: AsyncSession) -> int:
    r = await db.execute(select(func.coalesce(func.max(User.seq_no), 0)))
    return int(r.scalar_one() or 0) + 1
