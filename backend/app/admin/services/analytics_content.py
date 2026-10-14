from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.generated_content import GeneratedContent
from app.models.user import User


async def dashboard_style_stats(db: AsyncSession) -> dict:
    """与 admin_frontend /analytics 页卡片数据形状接近的聚合（能算则算，失败则降级）。"""
    out: dict = {
        "new_users_this_month": 0,
        "completed_generations_this_month": 0,
        "documents_completed_this_month": 0,
        "generation_total_all_time": 0,
    }

    today = date.today()
    month_start = datetime(today.year, today.month, 1)

    try:
        out["new_users_this_month"] = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(User)
                    .where(User.role == "user", User.created_at >= month_start)
                )
            ).scalar()
            or 0
        )

        gc_done = GeneratedContent.status == "completed"
        out["completed_generations_this_month"] = int(
            (
                await db.execute(
                    select(func.count()).select_from(GeneratedContent).where(
                        gc_done, GeneratedContent.created_at >= month_start
                    )
                )
            ).scalar()
            or 0
        )

        out["documents_completed_this_month"] = int(
            (
                await db.execute(
                    select(func.count()).select_from(Document).where(
                        Document.status == "completed",
                        Document.created_at >= month_start,
                    )
                )
            ).scalar()
            or 0
        )

        out["generation_total_all_time"] = int(
            (await db.execute(select(func.count()).select_from(GeneratedContent).where(gc_done))).scalar()
            or 0
        )
    except SQLAlchemyError:
        await db.rollback()

    return out


async def model_usage_rank(db: AsyncSession, *, limit: int = 15) -> list[dict]:
    try:
        stmt = (
            select(
                GeneratedContent.model_name.label("name"),
                func.count(GeneratedContent.id).label("cnt"),
            )
            .where(
                GeneratedContent.status == "completed",
                GeneratedContent.model_name.is_not(None),
            )
            .group_by(GeneratedContent.model_name)
            .order_by(func.count(GeneratedContent.id).desc())
            .limit(limit)
        )
        r = await db.execute(stmt)
        return [{"modelName": row.name or "", "count": int(row.cnt or 0)} for row in r.all()]
    except SQLAlchemyError:
        await db.rollback()
        return []


async def generations_daily_trend(db: AsyncSession, *, days: int = 7) -> list[dict]:
    days = max(1, min(days, 90))
    try:
        dcol = func.date(GeneratedContent.created_at)
        stmt = (
            select(dcol.label("d"), func.count(GeneratedContent.id).label("cnt"))
            .where(GeneratedContent.status == "completed")
            .group_by(dcol)
            .order_by(dcol.desc())
            .limit(days)
        )
        r = await db.execute(stmt)
        rows = []
        for row in r.all():
            ds = row.d
            label = ds.strftime("%m/%d") if hasattr(ds, "strftime") else str(ds)
            rows.append({"date": label, "generations": int(row.cnt or 0)})
        return list(reversed(rows))
    except SQLAlchemyError:
        await db.rollback()
        return []
