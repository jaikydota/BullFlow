"""埋点事件落库服务。

只负责把前端上报的事件写入 `analytics_events` 原始表；聚合统计在
`schedule_service` 的每日任务里做。设计原则：**埋点失败绝不影响业务**——
调用方（上报接口）捕获异常并静默，本服务只做校验 + 批量插入。
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import analytics_events as EV
from app.core.analytics_events import ALLOWED_EVENTS
from app.models.analytics_event import AnalyticsDailyStat, AnalyticsEvent
from app.schemas.analytics import TrackEventIn

logger = logging.getLogger(__name__)

# 北京时区：业务自然日以北京日为准（stat_date）。事件表 created_at 存 naive UTC，
# 按北京日统计需把「北京日 [00:00,24:00)」换算成 UTC 窗口再查询。
_CST = timezone(timedelta(hours=8))


async def record_events(
    db: AsyncSession,
    items: list[TrackEventIn],
    *,
    user_id: str | None,
    ip: str | None,
    user_agent: str | None,
) -> int:
    """批量落库埋点事件，返回成功入库条数。

    - 未知 event_name 直接丢弃（防脏数据 / 恶意上报污染统计）。
    - user_id 由上报接口从可选 token 解析；匿名时为 None。
    - 仅 flush，由调用方 commit（上报接口负责）。
    """
    rows: list[AnalyticsEvent] = []
    for it in items:
        if it.event_name not in ALLOWED_EVENTS:
            logger.warning("[analytics] 丢弃未知事件: %s", it.event_name)
            continue
        rows.append(
            AnalyticsEvent(
                event_name=it.event_name,
                user_id=user_id,
                visitor_id=(it.visitor_id or "")[:64],
                session_id=(it.session_id or None),
                page_url=(it.page_url or None),
                referrer=(it.referrer or None),
                properties=(it.properties or None),
                ip=ip,
                user_agent=((user_agent or "")[:512] or None),
            )
        )
    if not rows:
        return 0
    db.add_all(rows)
    await db.flush()
    return len(rows)


# ————————————————————————————————————————————————————————————————
# 指标计算（admin 实时接口 + 每日聚合任务共用；管理后台 app/admin 直接 import 复用）
# ————————————————————————————————————————————————————————————————

def beijing_day_utc_range(d: date) -> tuple[datetime, datetime]:
    """把北京自然日 d 换算成 [start, end) 的 naive-UTC 窗口（用于查事件/订单表）。"""
    start_cst = datetime(d.year, d.month, d.day, tzinfo=_CST)
    end_cst = start_cst + timedelta(days=1)
    start_utc = start_cst.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_cst.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, end_utc


def beijing_today() -> date:
    """当前北京自然日（不依赖容器 TZ）。"""
    return datetime.now(_CST).date()


async def _count_by_event(db: AsyncSession, start: datetime, end: datetime) -> dict[str, int]:
    r = await db.execute(
        select(AnalyticsEvent.event_name, func.count())
        .where(AnalyticsEvent.created_at >= start, AnalyticsEvent.created_at < end)
        .group_by(AnalyticsEvent.event_name)
    )
    return {name: int(c) for name, c in r.all()}


async def _distinct_count(
    db: AsyncSession, col, event: str, start: datetime, end: datetime
) -> int:
    r = await db.execute(
        select(func.count(func.distinct(col))).where(
            AnalyticsEvent.created_at >= start,
            AnalyticsEvent.created_at < end,
            AnalyticsEvent.event_name == event,
        )
    )
    return int(r.scalar() or 0)


async def compute_metrics(db: AsyncSession, start: datetime, end: datetime) -> dict[str, int]:
    """在 [start, end) UTC 窗口内计算全部核心指标（返回 dict，字段对齐聚合表列）。

    - 行为类（访问/生成/导出/套餐）从埋点事件表统计；
    - 注册数 / 支付成功人数 / 收入从真实业务表（User / SaasOrder）统计，更权威，
      避免依赖不可信的前端上报金额。
    """
    from app.models.saas import SaasOrder
    from app.models.user import User

    c = await _count_by_event(db, start, end)
    metrics: dict[str, int] = {
        "visit_pv": c.get(EV.EVENT_PAGE_VIEW, 0),
        "create_project_count": c.get(EV.EVENT_CREATE_PROJECT, 0),
        "generation_count": c.get(EV.EVENT_GENERATION_START, 0),
        "generation_success_count": c.get(EV.EVENT_GENERATION_SUCCESS, 0),
        "generation_failed_count": c.get(EV.EVENT_GENERATION_FAILED, 0),
        "export_count": c.get(EV.EVENT_EXPORT_START, 0),
        "export_success_count": c.get(EV.EVENT_EXPORT_SUCCESS, 0),
        "export_failed_count": c.get(EV.EVENT_EXPORT_FAILED, 0),
        "pay_failed_count": c.get(EV.EVENT_PAYMENT_FAILED, 0),
    }
    metrics["visit_users"] = await _distinct_count(db, AnalyticsEvent.visitor_id, EV.EVENT_PAGE_VIEW, start, end)
    metrics["login_users"] = await _distinct_count(db, AnalyticsEvent.user_id, EV.EVENT_LOGIN_SUCCESS, start, end)
    metrics["pricing_visit_users"] = await _distinct_count(db, AnalyticsEvent.visitor_id, EV.EVENT_VIEW_PRICING, start, end)
    metrics["plan_select_users"] = await _distinct_count(db, AnalyticsEvent.visitor_id, EV.EVENT_SELECT_PLAN, start, end)
    metrics["pay_start_users"] = await _distinct_count(db, AnalyticsEvent.visitor_id, EV.EVENT_PAYMENT_START, start, end)

    # —— 业务表（权威来源）——
    reg = await db.execute(
        select(func.count()).where(
            User.role == "user", User.created_at >= start, User.created_at < end
        )
    )
    metrics["register_users"] = int(reg.scalar() or 0)

    pay_users = await db.execute(
        select(func.count(func.distinct(SaasOrder.user_id))).where(
            SaasOrder.status == "paid", SaasOrder.paid_at >= start, SaasOrder.paid_at < end
        )
    )
    metrics["pay_success_users"] = int(pay_users.scalar() or 0)

    revenue = await db.execute(
        select(
            func.coalesce(
                func.sum(func.coalesce(SaasOrder.actual_revenue_cents, SaasOrder.amount_cents)), 0
            )
        ).where(
            SaasOrder.status == "paid", SaasOrder.paid_at >= start, SaasOrder.paid_at < end
        )
    )
    metrics["revenue_cents"] = int(revenue.scalar() or 0)
    return metrics


async def aggregate_daily(db: AsyncSession, target: date) -> AnalyticsDailyStat:
    """统计某北京自然日并 upsert 到聚合表（幂等，可重复重算）。"""
    start, end = beijing_day_utc_range(target)
    metrics = await compute_metrics(db, start, end)
    row = (
        await db.execute(
            select(AnalyticsDailyStat).where(AnalyticsDailyStat.stat_date == target)
        )
    ).scalar_one_or_none()
    if row is None:
        row = AnalyticsDailyStat(stat_date=target)
        db.add(row)
    for k, v in metrics.items():
        setattr(row, k, v)
    await db.flush()
    return row
