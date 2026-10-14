"""销售引流：销售用户（role=sales）CRUD + 引流归因统计。"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.admin.phone import normalize_cn_phone
from app.core.security import hash_password
from app.admin.services.audit_logger import append_audit_log
from app.admin.services.saas_ops import _random_code
from app.admin.schemas.saas_admin import SalesOut, SalesPromote, SalesUpdate

from app.models.saas import SaasOrder, SaasSubscription
from app.models.user import User


def _revenue_expr():
    return func.coalesce(SaasOrder.actual_revenue_cents, SaasOrder.amount_cents)


async def _referral_stats(db: AsyncSession, sales_ids: list[str]) -> dict[str, dict]:
    """聚合每个销售的：引流用户数 / 付费用户数 / 贡献营收（分）。"""
    if not sales_ids:
        return {}
    # 引流用户数
    rc = await db.execute(
        select(User.sales_id, func.count(User.id))
        .where(User.sales_id.in_(sales_ids))
        .group_by(User.sales_id)
    )
    referred = {str(sid): int(n or 0) for sid, n in rc.all()}

    # 付费用户数（去重）+ 贡献营收（paid 订单）
    pc = await db.execute(
        select(
            User.sales_id,
            func.count(func.distinct(User.id)),
            func.coalesce(func.sum(_revenue_expr()), 0),
        )
        .join(SaasOrder, SaasOrder.user_id == User.id)
        .where(User.sales_id.in_(sales_ids), SaasOrder.status == "paid")
        .group_by(User.sales_id)
    )
    paid: dict[str, tuple[int, int]] = {
        str(sid): (int(cnt or 0), int(rev or 0)) for sid, cnt, rev in pc.all()
    }
    out: dict[str, dict] = {}
    for sid in sales_ids:
        p = paid.get(sid, (0, 0))
        out[sid] = {
            "referredCount": referred.get(sid, 0),
            "paidCount": p[0],
            "revenueYuan": p[1] // 100,
        }
    return out


def _sales_to_out(row: User, stats: dict | None = None) -> dict:
    s = stats or {}
    return SalesOut(
        id=str(row.id),
        nickname=row.nickname,
        invitationCode=row.invitation_code,
        email=None if (row.email or "").endswith("@matrix365.local") else row.email,
        phone=row.phone,
        status=row.status,
        referredCount=s.get("referredCount", 0),
        paidCount=s.get("paidCount", 0),
        revenueYuan=s.get("revenueYuan", 0),
        createdAt=row.created_at.isoformat(timespec="seconds") if row.created_at else None,
    ).model_dump()


async def list_sales(db: AsyncSession, *, search: str | None = None) -> list[dict]:
    stmt = select(User).where(User.role == "sales").order_by(User.created_at.desc())
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            func.coalesce(User.nickname, "").like(like)
            | func.coalesce(User.invitation_code, "").like(like)
            | func.coalesce(User.email, "").like(like)
            | func.coalesce(User.phone, "").like(like)
        )
    rows = list((await db.execute(stmt)).scalars().all())
    stats = await _referral_stats(db, [str(r.id) for r in rows])
    return [_sales_to_out(r, stats.get(str(r.id))) for r in rows]


async def _gen_unique_code(db: AsyncSession) -> str:
    for _ in range(12):
        code = _random_code(8).upper()
        ex = (
            await db.execute(select(User.id).where(User.invitation_code == code))
        ).scalar_one_or_none()
        if ex is None:
            return code
    raise ConflictError("邀请码生成失败，请重试")


async def list_candidates(db: AsyncSession, *, search: str | None = None, limit: int = 20) -> list[dict]:
    """可被设为销售的候选账号：仅普通用户（role=user）。"""
    stmt = select(User).where(User.role == "user").order_by(User.created_at.desc())
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            func.coalesce(User.nickname, "").like(like)
            | func.coalesce(User.phone, "").like(like)
            | func.coalesce(User.email, "").like(like)
        )
    rows = list((await db.execute(stmt.limit(limit))).scalars().all())
    out = []
    for u in rows:
        out.append(
            {
                "id": str(u.id),
                "nickname": u.nickname,
                "phoneTail": (u.phone or "")[-4:] if u.phone else None,
                "email": None if (u.email or "").endswith("@matrix365.local") else u.email,
                "createdAt": u.created_at.isoformat(timespec="seconds") if u.created_at else None,
            }
        )
    return out


async def promote_sales(db: AsyncSession, body: SalesPromote, *, operator_id: str | None = None) -> dict:
    """把一个已有普通用户（role=user）转为销售：赋 role=sales + 分配邀请码。

    保留其手机号 / 订阅 / 订单（因此可继续用原手机号登录用户端）。
    """
    row = (await db.execute(select(User).where(User.id == body.user_id))).scalar_one_or_none()
    if row is None:
        raise NotFoundError("用户不存在")
    if row.role != "user":
        raise ConflictError("仅普通用户可设为销售")

    code = (body.invitation_code or "").strip().upper() or await _gen_unique_code(db)
    if (await db.execute(select(User.id).where(User.invitation_code == code))).scalar_one_or_none():
        raise ConflictError("邀请码已存在")

    row.role = "sales"
    row.invitation_code = code
    await db.flush()
    await db.refresh(row)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="sales.promote",
            resource_type="sales",
            resource_id=str(row.id),
            detail={"invitation_code": code},
        )
    stats = await _referral_stats(db, [str(row.id)])
    return _sales_to_out(row, stats.get(str(row.id)))


async def update_sales(
    db: AsyncSession, sales_id: str, body: SalesUpdate, *, operator_id: str | None = None
) -> dict:
    row = (
        await db.execute(select(User).where(User.id == sales_id, User.role == "sales"))
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("销售不存在")
    if body.nickname is not None:
        row.nickname = body.nickname.strip()
    if body.email is not None:
        email = body.email.strip().lower()
        if email:
            dup = (
                await db.execute(select(User.id).where(User.email == email, User.id != row.id))
            ).scalar_one_or_none()
            if dup:
                raise ConflictError("邮箱已被占用")
            row.email = email
    if body.phone is not None:
        phone = normalize_cn_phone(body.phone.strip() or None)
        if phone:
            dup = (
                await db.execute(select(User.id).where(User.phone == phone, User.id != row.id))
            ).scalar_one_or_none()
            if dup:
                raise ConflictError("手机号已被占用")
        row.phone = phone
    if body.password:
        row.password_hash = hash_password(body.password)
    if body.status is not None:
        row.status = body.status
    await db.flush()
    await db.refresh(row)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="sales.update",
            resource_type="sales",
            resource_id=str(row.id),
        )
    stats = await _referral_stats(db, [str(row.id)])
    return _sales_to_out(row, stats.get(str(row.id)))


async def delete_sales(db: AsyncSession, sales_id: str, *, operator_id: str | None = None) -> dict:
    """移除销售身份：销售本质是「已提升的普通用户」，此处**不删除账号**，而是降级回 role=user
    并清空其引流邀请码（该码失效）。被其引流用户的 sales_id 历史归因保留，账号与数据完整保留。
    """
    row = (
        await db.execute(select(User).where(User.id == sales_id, User.role == "sales"))
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("销售不存在")
    row.role = "user"
    row.invitation_code = None
    await db.flush()
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="sales.remove",
            resource_type="sales",
            resource_id=sales_id,
        )
    return {"id": sales_id}


async def sales_overview(db: AsyncSession, *, top_n: int = 8, trend_days: int = 30) -> dict:
    # Top 引流销售（按引流用户数）
    tr = await db.execute(
        select(User.sales_id, func.count(User.id).label("c"))
        .where(User.sales_id.isnot(None))
        .group_by(User.sales_id)
        .order_by(func.count(User.id).desc())
        .limit(top_n)
    )
    rows = tr.all()
    name_map: dict[str, str] = {}
    if rows:
        ids = [str(sid) for sid, _ in rows]
        nm = await db.execute(select(User.id, User.nickname).where(User.id.in_(ids)))
        name_map = {str(i): (n or "未命名") for i, n in nm.all()}
    top = [{"name": name_map.get(str(sid), "未命名"), "count": int(c or 0)} for sid, c in rows]

    # 近 N 天引流注册趋势（按日）
    since = datetime.utcnow() - timedelta(days=trend_days)
    dr = await db.execute(
        select(func.date(User.created_at).label("d"), func.count(User.id))
        .where(User.sales_id.isnot(None), User.created_at >= since)
        .group_by(func.date(User.created_at))
        .order_by(func.date(User.created_at))
    )
    trend = [{"date": str(d), "count": int(n or 0)} for d, n in dr.all()]

    # 汇总卡片
    sales_total = int(
        (await db.execute(select(func.count(User.id)).where(User.role == "sales"))).scalar() or 0
    )
    referred_total = int(
        (await db.execute(select(func.count(User.id)).where(User.sales_id.isnot(None)))).scalar() or 0
    )
    paid_total = int(
        (
            await db.execute(
                select(func.count(func.distinct(User.id)))
                .join(SaasOrder, SaasOrder.user_id == User.id)
                .where(User.sales_id.isnot(None), SaasOrder.status == "paid")
            )
        ).scalar()
        or 0
    )
    revenue_cents = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(_revenue_expr()), 0))
                .join(User, User.id == SaasOrder.user_id)
                .where(User.sales_id.isnot(None), SaasOrder.status == "paid")
            )
        ).scalar()
        or 0
    )
    return {
        "summary": {
            "salesTotal": sales_total,
            "referredTotal": referred_total,
            "paidTotal": paid_total,
            "revenueYuan": revenue_cents // 100,
        },
        "topSales": top,
        "trend": trend,
    }


async def sales_referrals(
    db: AsyncSession, sales_id: str, *, page: int = 1, page_size: int = 20
) -> tuple[list[dict], int]:
    base = select(User).where(User.sales_id == sales_id)
    total = int(
        (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    )
    rows = list(
        (
            await db.execute(
                base.order_by(User.created_at.desc())
                .limit(page_size)
                .offset((page - 1) * page_size)
            )
        )
        .scalars()
        .all()
    )
    out = []
    for u in rows:
        plan = (
            await db.execute(
                select(SaasSubscription.plan_slug).where(
                    SaasSubscription.user_id == u.id, SaasSubscription.status == "active"
                )
            )
        ).scalar_one_or_none()
        paid = (
            await db.execute(
                select(func.count())
                .select_from(SaasOrder)
                .where(SaasOrder.user_id == u.id, SaasOrder.status == "paid")
            )
        ).scalar()
        out.append(
            {
                "id": str(u.id),
                "nickname": u.nickname,
                "phoneTail": (u.phone or "")[-4:] if u.phone else None,
                "planSlug": plan,
                "paid": int(paid or 0) > 0,
                "createdAt": u.created_at.isoformat(timespec="seconds") if u.created_at else None,
            }
        )
    return out, total


async def self_dashboard(db: AsyncSession, sales_user: User, *, trend_days: int = 30) -> dict:
    """销售自助看板：本人的引流统计 + 近 N 天引流注册趋势。"""
    sid = str(sales_user.id)
    stats = (await _referral_stats(db, [sid])).get(sid, {})
    since = datetime.utcnow() - timedelta(days=trend_days)
    dr = await db.execute(
        select(func.date(User.created_at), func.count(User.id))
        .where(User.sales_id == sid, User.created_at >= since)
        .group_by(func.date(User.created_at))
        .order_by(func.date(User.created_at))
    )
    trend = [{"date": str(d), "count": int(n or 0)} for d, n in dr.all()]
    return {
        "id": sid,
        "nickname": sales_user.nickname,
        "invitationCode": sales_user.invitation_code,
        "email": None if (sales_user.email or "").endswith("@matrix365.local") else sales_user.email,
        "referredCount": stats.get("referredCount", 0),
        "paidCount": stats.get("paidCount", 0),
        "revenueYuan": stats.get("revenueYuan", 0),
        "trend": trend,
    }
