"""后台「数据埋点分析」服务。

计算逻辑复用主 backend 的 `app.services.analytics_service`（同进程 import）：
- 汇总指标对整个时间窗口实时 `compute_metrics`（跨天 distinct 去重最准）；
- 趋势按天：优先读 `analytics_daily_stats` 聚合表，缺失的天实时补算（不落库）；
- 漏斗对事件表逐步统计 distinct 访客。
admin 连的是同一个 MySQL 库，故可直接查 analytics_events / analytics_daily_stats。
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.analytics_events import FUNNEL_STEPS
from app.core.time import to_utc_iso
from app.models.analytics_event import AnalyticsDailyStat, AnalyticsEvent
from app.services.analytics_service import (
    beijing_day_utc_range,
    beijing_today,
    compute_metrics,
)

# 聚合表数值字段（趋势按天返回这些）
_DAILY_FIELDS = [
    "visit_users", "visit_pv", "register_users", "login_users",
    "create_project_count", "generation_count", "generation_success_count",
    "generation_failed_count", "export_count", "export_success_count",
    "export_failed_count", "pricing_visit_users", "plan_select_users",
    "pay_start_users", "pay_success_users", "pay_failed_count", "revenue_cents",
]

_MAX_RANGE_DAYS = 92


def _rate(n: int, d: int) -> float:
    return round(n / d * 100, 2) if d else 0.0


def resolve_range(range_key: str, start: str | None, end: str | None) -> tuple[date, date]:
    """把前端时间范围（today/yesterday/7d/30d/custom）解析为闭区间北京日 [sd, ed]。"""
    today = beijing_today()
    if range_key == "today":
        return today, today
    if range_key == "yesterday":
        y = today - timedelta(days=1)
        return y, y
    if range_key == "7d":
        return today - timedelta(days=6), today
    if range_key == "30d":
        return today - timedelta(days=29), today
    if range_key == "custom":
        try:
            sd = date.fromisoformat(start or "")
            ed = date.fromisoformat(end or "")
            if sd > ed:
                sd, ed = ed, sd
            if (ed - sd).days > _MAX_RANGE_DAYS:
                sd = ed - timedelta(days=_MAX_RANGE_DAYS)
            return sd, ed
        except (TypeError, ValueError):
            return today, today
    return today, today


def _window(sd: date, ed: date):
    return beijing_day_utc_range(sd)[0], beijing_day_utc_range(ed)[1]


def _row_to_metrics(row: AnalyticsDailyStat) -> dict:
    return {f: int(getattr(row, f) or 0) for f in _DAILY_FIELDS}


def _enrich_rates(m: dict) -> dict:
    m = dict(m)
    m["generation_success_rate"] = _rate(m.get("generation_success_count", 0), m.get("generation_count", 0))
    m["generation_failed_rate"] = _rate(m.get("generation_failed_count", 0), m.get("generation_count", 0))
    m["export_success_rate"] = _rate(m.get("export_success_count", 0), m.get("export_count", 0))
    m["export_failed_rate"] = _rate(m.get("export_failed_count", 0), m.get("export_count", 0))
    m["pay_success_rate"] = _rate(m.get("pay_success_users", 0), m.get("pay_start_users", 0))
    m["register_conversion_rate"] = _rate(m.get("register_users", 0), m.get("visit_users", 0))
    m["pay_conversion_rate"] = _rate(m.get("pay_success_users", 0), m.get("register_users", 0))
    return m


async def daily_series(db: AsyncSession, sd: date, ed: date) -> list[dict]:
    """范围内每天一条：优先聚合表，缺失实时补算。"""
    have: dict[date, AnalyticsDailyStat] = {}
    try:
        r = await db.execute(
            select(AnalyticsDailyStat).where(
                AnalyticsDailyStat.stat_date >= sd, AnalyticsDailyStat.stat_date <= ed
            )
        )
        have = {row.stat_date: row for row in r.scalars().all()}
    except SQLAlchemyError:
        await db.rollback()

    today = beijing_today()
    out: list[dict] = []
    d = sd
    while d <= ed:
        # 今天的聚合行是凌晨 cron 写入的滚动旧值（要到次日凌晨才重算完整），
        # 必须实时重算；历史天直接用聚合表。
        if d in have and d != today:
            m = _row_to_metrics(have[d])
        else:
            ws, we = beijing_day_utc_range(d)
            m = await compute_metrics(db, ws, we)
        m["date"] = d.isoformat()
        out.append(m)
        d += timedelta(days=1)
    return out


async def _summary(db: AsyncSession, range_key: str, start: str | None, end: str | None) -> dict:
    sd, ed = resolve_range(range_key, start, end)
    ws, we = _window(sd, ed)
    metrics = _enrich_rates(await compute_metrics(db, ws, we))
    return {
        "range": {"key": range_key, "start": sd.isoformat(), "end": ed.isoformat()},
        "metrics": metrics,
        "trend": await daily_series(db, sd, ed),
    }


async def overview(db: AsyncSession, *, range_key: str, start: str | None, end: str | None) -> dict:
    return await _summary(db, range_key, start, end)


async def creation(db: AsyncSession, *, range_key: str, start: str | None, end: str | None) -> dict:
    """创作分析：与 overview 同数据，前端取创作相关字段。"""
    return await _summary(db, range_key, start, end)


async def payment(db: AsyncSession, *, range_key: str, start: str | None, end: str | None) -> dict:
    """支付分析：与 overview 同数据，前端取支付相关字段。"""
    return await _summary(db, range_key, start, end)


async def funnel(db: AsyncSession, *, range_key: str, start: str | None, end: str | None) -> dict:
    sd, ed = resolve_range(range_key, start, end)
    ws, we = _window(sd, ed)
    steps: list[dict] = []
    first: int | None = None
    prev: int | None = None
    for event, label in FUNNEL_STEPS:
        try:
            r = await db.execute(
                select(func.count(func.distinct(AnalyticsEvent.visitor_id))).where(
                    AnalyticsEvent.event_name == event,
                    AnalyticsEvent.created_at >= ws,
                    AnalyticsEvent.created_at < we,
                )
            )
            n = int(r.scalar() or 0)
        except SQLAlchemyError:
            await db.rollback()
            n = 0
        if first is None:
            first = n
        steps.append({
            "event": event,
            "label": label,
            "count": n,
            "rate_from_first": _rate(n, first),
            "rate_from_prev": _rate(n, prev) if prev is not None else 100.0,
            "loss": max((prev - n), 0) if prev is not None else 0,
        })
        prev = n
    return {"range": {"key": range_key, "start": sd.isoformat(), "end": ed.isoformat()}, "steps": steps}


async def list_events(
    db: AsyncSession,
    *,
    event_name: str | None,
    user_id: str | None,
    range_key: str,
    start: str | None,
    end: str | None,
    page: int,
    page_size: int,
) -> tuple[list[dict], int]:
    sd, ed = resolve_range(range_key, start, end)
    ws, we = _window(sd, ed)
    conds = [AnalyticsEvent.created_at >= ws, AnalyticsEvent.created_at < we]
    if event_name:
        conds.append(AnalyticsEvent.event_name == event_name)
    if user_id:
        # user_id 列是 BINARY(16)，非法 uuid 字符串会在绑定期抛 ValueError（非 SQLAlchemyError），
        # 不校验会 500；非法直接返回空结果集。
        try:
            uuid.UUID(user_id)
        except ValueError:
            return [], 0
        conds.append(AnalyticsEvent.user_id == user_id)
    try:
        total = int(
            (await db.execute(select(func.count()).select_from(AnalyticsEvent).where(*conds))).scalar() or 0
        )
        r = await db.execute(
            select(AnalyticsEvent)
            .where(*conds)
            .order_by(AnalyticsEvent.created_at.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        items = [
            {
                "id": e.id,
                "event_name": e.event_name,
                "user_id": e.user_id,
                "visitor_id": e.visitor_id,
                "page_url": e.page_url,
                "properties": e.properties,
                "created_at": to_utc_iso(e.created_at),
            }
            for e in r.scalars().all()
        ]
        return items, total
    except SQLAlchemyError:
        await db.rollback()
        return [], 0
