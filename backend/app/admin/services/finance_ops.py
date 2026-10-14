"""财务团队：财务用户（role=finance）的提升 / 撤销 / 查询。

财务角色权限 = 订单核销 + 财务报表，仅能由普通用户（role=user）提升而来。
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.admin.schemas.saas_admin import FinanceOut, FinancePromote
from app.admin.services.audit_logger import append_audit_log

from app.models.user import User


def _finance_to_out(row: User) -> dict:
    return FinanceOut(
        id=str(row.id),
        nickname=row.nickname,
        email=None if (row.email or "").endswith("@matrix365.local") else row.email,
        phone=row.phone,
        status=row.status,
        createdAt=row.created_at.isoformat(timespec="seconds") if row.created_at else None,
    ).model_dump()


async def list_finance(db: AsyncSession, *, search: str | None = None) -> list[dict]:
    stmt = select(User).where(User.role == "finance").order_by(User.created_at.desc())
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            func.coalesce(User.nickname, "").like(like)
            | func.coalesce(User.email, "").like(like)
            | func.coalesce(User.phone, "").like(like)
        )
    rows = list((await db.execute(stmt)).scalars().all())
    return [_finance_to_out(r) for r in rows]


async def list_candidates(db: AsyncSession, *, search: str | None = None, limit: int = 20) -> list[dict]:
    """可被设为财务的候选账号：仅普通用户（role=user）。"""
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


async def promote_finance(
    db: AsyncSession, body: FinancePromote, *, operator_id: str | None = None
) -> dict:
    """把一个已有普通用户（role=user）转为财务：赋 role=finance。

    保留其手机号 / 订阅 / 订单（因此可继续用原手机号登录用户端）。
    """
    row = (await db.execute(select(User).where(User.id == body.user_id))).scalar_one_or_none()
    if row is None:
        raise NotFoundError("用户不存在")
    if row.role != "user":
        raise ConflictError("仅普通用户可设为财务")
    if not (row.phone or "").strip():
        raise ConflictError("财务账户必须有手机号（用于接收审核短信），请先为该用户补充手机号再设为财务")

    row.role = "finance"
    await db.flush()
    await db.refresh(row)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="finance.promote",
            resource_type="finance",
            resource_id=str(row.id),
            detail={"nickname": row.nickname},
        )
    return _finance_to_out(row)


async def revoke_finance(
    db: AsyncSession, user_id: str, *, operator_id: str | None = None
) -> dict:
    """撤销财务：role=finance 降回 role=user。"""
    row = (
        await db.execute(select(User).where(User.id == user_id, User.role == "finance"))
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("财务不存在")

    row.role = "user"
    await db.flush()
    await db.refresh(row)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="finance.revoke",
            resource_type="finance",
            resource_id=str(row.id),
        )
    return {"id": user_id}
