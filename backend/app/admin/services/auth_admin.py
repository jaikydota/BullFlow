from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, ForbiddenError
from app.admin.phone import phone_match_candidates
from app.core.security import verify_password
from app.models.saas import SaasPlan, SaasSubscription
from app.models.user import User


async def authenticate_admin(db: AsyncSession, account: str, password: str) -> User:
    """账号支持邮箱或已绑定手机号 + 密码。"""
    acc = account.strip()
    # 先按邮箱（忽略大小写）查；查不到再按手机号（原样 / 纯数字两种形式）查
    user = (
        await db.execute(select(User).where(func.lower(User.email) == acc.lower()))
    ).scalar_one_or_none()
    if user is None and acc:
        candidates = phone_match_candidates(acc)
        if candidates:
            user = (
                await db.execute(select(User).where(User.phone.in_(candidates)))
            ).scalar_one_or_none()

    if user is None or not verify_password(password, user.password_hash):
        raise AuthenticationError("账号或密码错误")

    if user.status != "active":
        raise ForbiddenError("用户已被禁用")

    if user.role not in ("super_admin", "admin", "sales", "finance"):
        raise ForbiddenError(
            "该账号为业务租户用户（role=user），不能登录管理后台；"
            "请使用超级管理员账号在「用户管理」中将其角色改为 admin 后再试。"
        )

    return user


async def list_users(
    db: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    role: str | None = None,
) -> tuple[list[User], int]:
    query = select(User)
    count_query = select(func.count()).select_from(User)

    if search:
        like = f"%{search}%"
        filt = User.email.like(like) | User.nickname.like(like)  # MySQL LIKE
        query = query.where(filt)
        count_query = count_query.where(filt)

    if role:
        query = query.where(User.role == role)
        count_query = count_query.where(User.role == role)

    total_result = await db.execute(count_query)
    total = int(total_result.scalar() or 0)

    query = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def subscription_summaries(db: AsyncSession, user_ids: list[str]) -> dict[str, dict]:
    """批量取这些用户当前 active 套餐摘要，键为 str(user_id)。用于用户列表展示套餐/剩余积分。"""
    if not user_ids:
        return {}
    rows = list(
        (
            await db.execute(
                select(SaasSubscription)
                .where(
                    SaasSubscription.user_id.in_(user_ids),
                    SaasSubscription.status == "active",
                )
                .order_by(SaasSubscription.expires_at.desc())
            )
        )
        .scalars()
        .all()
    )
    name_map = {s: n for s, n in (await db.execute(select(SaasPlan.slug, SaasPlan.name))).all()}
    out: dict[str, dict] = {}
    for sub in rows:
        uid = str(sub.user_id)
        if uid in out:  # 已按 expires_at desc 排序，首个即最新生效订阅
            continue
        remaining = int(sub.points_quota) - int(sub.points_used) + int(sub.addon_points)
        out[uid] = {
            "plan_slug": sub.plan_slug,
            "plan_name": name_map.get(sub.plan_slug, sub.plan_slug),
            "plan_status": sub.status,
            "plan_expires_at": sub.expires_at.isoformat(timespec="seconds") if sub.expires_at else None,
            "points_remaining": max(0, remaining),
            "points_quota": int(sub.points_quota),
            "addon_points": int(sub.addon_points),
        }
    return out
