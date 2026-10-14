"""普通用户「邀请有礼」：邀请码 + 一阶(注册)/二阶(充值)增量包奖励。

奖励加包由后台 platform_settings.registration_strategy 配置：
- referral_register_addon_id：被邀请人注册 → 发给邀请人（一阶）
- referral_recharge_addon_id：被邀请人首次真实充值成功 → 发给邀请人（二阶）

发放复用 saas_subscription.apply_addon_credit(allow_inactive=True)；二阶幂等靠
referral_rewards.recharge_granted_at 标志。
"""
from __future__ import annotations

import logging
import random
import string

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import to_utc_iso, utcnow
from app.models.admin_platform import PlatformSetting
from app.models.referral_reward import ReferralReward
from app.models.saas import SaasAddon
from app.models.user import User

logger = logging.getLogger(__name__)

_CODE_ALPHABET = string.ascii_uppercase + string.digits
_REG_KEY = "referral_register_addon_id"
_REC_KEY = "referral_recharge_addon_id"


# ---- 配置读取 ----

async def _get_referral_addon_id(db: AsyncSession, key: str) -> str | None:
    r = await db.execute(
        select(PlatformSetting.value).where(PlatformSetting.key == "registration_strategy")
    )
    value = r.scalar_one_or_none()
    if not isinstance(value, dict):
        return None
    raw = value.get(key)
    return str(raw) if raw else None


async def _get_addon(db: AsyncSession, addon_id: str) -> SaasAddon | None:
    return (
        await db.execute(select(SaasAddon).where(SaasAddon.id == addon_id))
    ).scalar_one_or_none()


async def _reward_desc(db: AsyncSession, addon_id: str | None) -> dict | None:
    """奖励说明：{name, points}；未配置 / 加包不存在返回 None（前端据此隐藏对应档位）。"""
    if not addon_id:
        return None
    addon = await _get_addon(db, addon_id)
    if addon is None:
        return None
    return {"name": addon.name, "points": int(addon.points_quota or 0)}


# ---- 邀请码 ----

async def ensure_invitation_code(db: AsyncSession, user: User) -> str:
    """用户没有邀请码则生成唯一码并入库；已有直接返回。"""
    if user.invitation_code:
        return user.invitation_code
    for _ in range(16):
        code = "".join(random.choices(_CODE_ALPHABET, k=8))
        dup = (
            await db.execute(select(User.id).where(User.invitation_code == code))
        ).scalar_one_or_none()
        if dup is None:
            user.invitation_code = code
            await db.flush()
            return code
    raise RuntimeError("邀请码生成失败，请重试")


async def resolve_inviter(db: AsyncSession, code: str | None) -> User | None:
    """把邀请码解析为邀请人（任意 active 用户：销售或普通用户）；无码 / 无效返回 None。"""
    c = (code or "").strip()
    if not c:
        return None
    return (
        await db.execute(
            select(User).where(User.invitation_code == c, User.status == "active")
        )
    ).scalar_one_or_none()


# ---- 奖励发放 ----

async def record_referral_tier1(
    db: AsyncSession, *, inviter: User, invitee: User, code: str | None
) -> ReferralReward | None:
    """被邀请人注册：建邀请关系 + 发一阶奖励给邀请人（幂等 / 失败不阻塞注册）。"""
    if str(inviter.id) == str(invitee.id):
        return None
    existing = (
        await db.execute(
            select(ReferralReward).where(ReferralReward.invitee_id == invitee.id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    row = ReferralReward(
        inviter_id=inviter.id,
        invitee_id=invitee.id,
        invitation_code=(code or "").strip() or None,
    )
    db.add(row)
    await db.flush()

    addon_id = await _get_referral_addon_id(db, _REG_KEY)
    if addon_id:
        addon = await _get_addon(db, addon_id)
        if addon is not None:
            from app.services.saas_subscription import apply_addon_credit

            applied = await apply_addon_credit(
                db, user_id=str(inviter.id), addon_id=addon_id, quantity=1, allow_inactive=True
            )
            if applied is not None:
                row.register_granted_at = utcnow()
                row.register_points = int(addon.points_quota or 0)
                await db.flush()
    return row


async def grant_tier2_on_recharge(db: AsyncSession, invitee_id: str) -> None:
    """被邀请人首次真实充值成功：发二阶奖励给邀请人。幂等靠 recharge_granted_at。

    供 saas_billing._apply_gateway_paid 调用；调用方包 try/except，不阻塞支付主流程。
    """
    row = (
        await db.execute(
            select(ReferralReward).where(
                ReferralReward.invitee_id == invitee_id,
                ReferralReward.recharge_granted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return  # 非被邀请人，或二阶已发
    addon_id = await _get_referral_addon_id(db, _REC_KEY)
    if not addon_id:
        return  # 未配置二阶奖励
    addon = await _get_addon(db, addon_id)
    if addon is None:
        return
    from app.services.saas_subscription import apply_addon_credit

    applied = await apply_addon_credit(
        db, user_id=str(row.inviter_id), addon_id=addon_id, quantity=1, allow_inactive=True
    )
    if applied is not None:
        row.recharge_granted_at = utcnow()
        row.recharge_points = int(addon.points_quota or 0)
        await db.flush()


# ---- C 端展示 ----

def _mask_identity(u: User | None) -> str | None:
    """脱敏标识：优先手机号（139****5678），否则真实邮箱（ad***@example.com）。"""
    if u is None:
        return None
    phone = (u.phone or "").lstrip("+")
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("86") and len(digits) == 13:
        digits = digits[2:]
    if len(digits) == 11:
        return f"{digits[:3]}****{digits[-4:]}"
    email = u.email or ""
    if email and not email.endswith("@matrix365.local") and "@" in email:
        local, _, domain = email.partition("@")
        head = local[:2] if len(local) > 2 else local[:1]
        return f"{head}***@{domain}"
    return None


async def get_overview(db: AsyncSession, current_user: User) -> dict:
    user = (
        await db.execute(select(User).where(User.id == current_user.id))
    ).scalar_one()
    code = await ensure_invitation_code(db, user)
    register_reward = await _reward_desc(db, await _get_referral_addon_id(db, _REG_KEY))
    recharge_reward = await _reward_desc(db, await _get_referral_addon_id(db, _REC_KEY))

    invited = int(
        (
            await db.execute(
                select(func.count())
                .select_from(ReferralReward)
                .where(ReferralReward.inviter_id == user.id)
            )
        ).scalar()
        or 0
    )
    rewarded = int(
        (
            await db.execute(
                select(func.count())
                .select_from(ReferralReward)
                .where(
                    ReferralReward.inviter_id == user.id,
                    (ReferralReward.register_granted_at.isnot(None))
                    | (ReferralReward.recharge_granted_at.isnot(None)),
                )
            )
        ).scalar()
        or 0
    )
    return {
        "invitation_code": code,
        "register_reward": register_reward,
        "recharge_reward": recharge_reward,
        "stats": {"invited_count": invited, "rewarded_count": rewarded},
    }


async def list_referrals(
    db: AsyncSession, inviter_id: str, *, page: int = 1, page_size: int = 20
) -> tuple[list[dict], int]:
    base = select(ReferralReward).where(ReferralReward.inviter_id == inviter_id)
    total = int(
        (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    )
    rows = list(
        (
            await db.execute(
                base.order_by(ReferralReward.created_at.desc())
                .limit(page_size)
                .offset((page - 1) * page_size)
            )
        )
        .scalars()
        .all()
    )
    users: dict[str, User] = {}
    if rows:
        urows = (
            await db.execute(
                select(User).where(User.id.in_([r.invitee_id for r in rows]))
            )
        ).scalars().all()
        users = {str(u.id): u for u in urows}
    out = []
    for r in rows:
        u = users.get(str(r.invitee_id))
        out.append(
            {
                "id": str(r.id),
                "nickname": (u.nickname if u else None),
                "identity": _mask_identity(u),
                "created_at": to_utc_iso(r.created_at),
                "register_granted": r.register_granted_at is not None,
                "register_points": r.register_points,
                "recharge_granted": r.recharge_granted_at is not None,
                "recharge_points": r.recharge_points,
            }
        )
    return out, total
