"""订阅状态管理 service。

职责：
- 维护"用户当前 active 订阅"的唯一性（同一 user 同一时刻只有一条 active）
- 注册流程绑 Free 订阅
- 支付成功后激活/升级订阅
- 升降级差价计算
- 定时任务调用的到期切 expired

一个用户的"当前订阅"是 `SaasSubscription` 表里 `user_id=X AND status='active'` 的那一行。
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, NotFoundError
from app.core.time import utcnow
from app.models.admin_platform import PlatformSetting
from app.models.saas import SaasAddon, SaasPlan, SaasSubscription

logger = logging.getLogger(__name__)


# ---- 常量 ----

# 一个周期对应的天数（差价计算用，month=30 / quarter=90 / year=365）
PERIOD_DAYS = {"month": 30, "quarter": 90, "year": 365}

# Free 套餐 slug（与 app/admin/services/saas_seed.py 一致）
FREE_PLAN_SLUG = "free"


# ---- 定价工具 ----


def period_price_cents(plan: SaasPlan, period: str) -> int:
    """取套餐在指定计费周期下的有效价（分）。

    季付 / 年付自定义价为 NULL 时按月付价 ×3 / ×12 计算（默认价随月付价跟随）。
    """
    if period == "month":
        return plan.monthly_price_cents
    if period == "quarter":
        return (
            plan.quarterly_price_cents
            if plan.quarterly_price_cents is not None
            else plan.monthly_price_cents * 3
        )
    if period == "year":
        return (
            plan.yearly_price_cents
            if plan.yearly_price_cents is not None
            else plan.monthly_price_cents * 12
        )
    raise ValueError(f"未知计费周期：{period}")


def available_periods(plan: SaasPlan) -> list[str]:
    """套餐当前出售的计费周期列表（月付始终出售）。"""
    out = ["month"]
    if plan.quarterly_enabled:
        out.append("quarter")
    if plan.yearly_enabled:
        out.append("year")
    return out


# ---- 查询 ----


async def get_active_subscription(
    db: AsyncSession, user_id: str
) -> SaasSubscription | None:
    """查当前 active 订阅；无则返回 None。"""
    r = await db.execute(
        select(SaasSubscription).where(
            SaasSubscription.user_id == user_id,
            SaasSubscription.status == "active",
        ).order_by(SaasSubscription.expires_at.desc())
    )
    return r.scalars().first()


async def _get_plan(db: AsyncSession, slug: str) -> SaasPlan:
    r = await db.execute(select(SaasPlan).where(SaasPlan.slug == slug))
    plan = r.scalar_one_or_none()
    if plan is None:
        raise NotFoundError(f"套餐 {slug} 不存在")
    return plan


# ---- 注册时绑 Free ----


async def ensure_free_subscription(db: AsyncSession, user_id: str) -> SaasSubscription:
    """注册成功后调用：若已有 active 订阅则跳过，否则创建一条永久 Free 订阅。

    成功创建 Free 订阅后，如果 platform_settings.registration_strategy.welcome_addon_id
    指向某个积分类增量包，则发放永久积分作为欢迎礼物。

    调用方需自行 commit（参考 CLAUDE.md §五"flush vs commit"）。
    """
    existing = await get_active_subscription(db, user_id)
    if existing is not None:
        return existing

    plan = await _get_plan(db, FREE_PLAN_SLUG)
    now = utcnow()
    # Free 永久有效（100 年后）
    expires_at = now + timedelta(days=365 * 100)
    sub = SaasSubscription(
        user_id=user_id,
        plan_slug=plan.slug,
        period="month",
        status="active",
        started_at=now,
        expires_at=expires_at,
        points_quota=plan.points_quota,
        storage_gb_quota=plan.storage_gb,
        domestic_accounts_quota=plan.domestic_accounts,
        overseas_accounts_quota=plan.overseas_accounts,
    )
    db.add(sub)
    await db.flush()
    await db.refresh(sub)
    logger.info("ensure_free_subscription: user=%s plan=%s expires=%s", user_id, plan.slug, expires_at)

    # 欢迎增量包：读 platform_settings.registration_strategy.welcome_addon_id；失败不阻塞
    try:
        welcome_id = await _get_welcome_addon_id(db)
        if welcome_id:
            # 注册赠送：允许下架(仅禁购)的加包作为赠送来源
            await apply_addon_credit(
                db, user_id=user_id, addon_id=welcome_id, quantity=1, allow_inactive=True
            )
    except Exception as e:  # noqa: BLE001
        logger.warning("ensure_free_subscription: welcome addon failed user=%s err=%s", user_id, e)

    return sub


async def _get_welcome_addon_id(db: AsyncSession) -> str | None:
    """读 platform_settings.registration_strategy.welcome_addon_id；未配置返回 None。"""
    r = await db.execute(
        select(PlatformSetting.value).where(
            PlatformSetting.key == "registration_strategy"
        )
    )
    value = r.scalar_one_or_none()
    if not isinstance(value, dict):
        return None
    raw = value.get("welcome_addon_id")
    if not raw:
        return None
    return str(raw)


# ---- 差价计算 ----


def _remaining_days(expires_at: datetime, now: datetime | None = None) -> int:
    now = now or utcnow()
    delta = expires_at - now
    return max(0, delta.days)


def _remaining_value_cents(sub: SaasSubscription, current_plan: SaasPlan, now: datetime) -> int:
    """剩余价值 = 已付价 × (剩余天数 / 周期天数)。Free / 历史空套餐返回 0。"""
    current_price = period_price_cents(current_plan, sub.period)
    if current_price <= 0:
        return 0
    days = _remaining_days(sub.expires_at, now)
    period_days = PERIOD_DAYS.get(sub.period, 30)
    return int(current_price * days / period_days)


async def compute_quote(
    db: AsyncSession, user_id: str, target_slug: str, target_period: str = "month"
) -> dict:
    """C 端下单前预计算差价。返回 schemas.billing.QuoteOut 兼容的 dict。

    target_period 为用户所选的目标计费周期（month/quarter/year）。
    """
    target = await _get_plan(db, target_slug)
    target_price = period_price_cents(target, target_period)
    current_sub = await get_active_subscription(db, user_id)

    if current_sub is None:
        return {
            "target_plan_slug": target.slug,
            "target_price_cents": target_price,
            "current_plan_slug": None,
            "current_price_cents": 0,
            "remaining_days": 0,
            "remaining_value_cents": 0,
            "payable_cents": target_price,
            "action": "new",
            "note": None,
        }

    current_plan = await _get_plan(db, current_sub.plan_slug)
    current_price = period_price_cents(current_plan, current_sub.period)
    now = utcnow()
    remaining_days = _remaining_days(current_sub.expires_at, now)
    remaining_value = _remaining_value_cents(current_sub, current_plan, now)
    payable = max(0, target_price - remaining_value)

    if current_plan.slug == target.slug:
        action = "renew"
        note = "续费当前套餐，到期日将顺延。"
    elif target.tier < current_plan.tier:
        # 禁止降级：只能切换到不低于当前档位的套餐；降级请走客服
        raise BadRequestError(
            f"不支持从「{current_plan.name}」降级到更低档位的「{target.name}」，如需降级请联系客服。"
        )
    else:
        # 升级到更高档位，或同档位平级切换：统一按差价补款立即生效
        action = "upgrade"
        note = (
            f"切换到 {target.name}：剩余 {remaining_days} 天的 {current_plan.name} 价值 "
            f"{remaining_value / 100:.2f} 元已抵扣。"
        )

    return {
        "target_plan_slug": target.slug,
        "target_price_cents": target_price,
        "current_plan_slug": current_plan.slug,
        "current_price_cents": current_price,
        "remaining_days": remaining_days,
        "remaining_value_cents": remaining_value,
        "payable_cents": payable,
        "action": action,
        "note": note,
    }


# ---- 激活 / 升级 ----


async def activate_subscription(
    db: AsyncSession,
    *,
    user_id: str,
    target_plan: SaasPlan,
    selected_period: str = "month",
    source_order_id: str | None = None,
) -> SaasSubscription:
    """订单支付成功后调用。把现有 active 订阅置为 cancelled，并创建新订阅。

    selected_period 为用户下单时所选计费周期（决定到期日与订阅快照周期）。
    续费同套餐时直接延长 expires_at 而不新建。
    调用方自行 commit。
    """
    now = utcnow()
    period_days = PERIOD_DAYS.get(selected_period, 30)
    # Free 套餐永久有效（不计计费周期）；与 ensure_free_subscription / expire_due_subscriptions 一致
    is_free = target_plan.slug == FREE_PLAN_SLUG

    current = await get_active_subscription(db, user_id)

    # 续费同套餐：延长到期日 + 周期内额度重置
    if current is not None and current.plan_slug == target_plan.slug:
        current.expires_at = (
            now + timedelta(days=365 * 100)
            if is_free
            else max(current.expires_at, now) + timedelta(days=period_days)
        )
        current.period = selected_period
        # 套餐积分订阅日清零：直接重置为本套餐配额，已用量清零（addon_points 不动）
        current.points_quota = target_plan.points_quota
        current.points_used = 0
        # 存储/账号配额按套餐快照刷新（取较大值兜底，避免下调时把当前在用账号"踢掉"）
        current.storage_gb_quota = max(current.storage_gb_quota, target_plan.storage_gb)
        current.domestic_accounts_quota = max(current.domestic_accounts_quota, target_plan.domestic_accounts)
        current.overseas_accounts_quota = max(current.overseas_accounts_quota, target_plan.overseas_accounts)
        if source_order_id:
            current.source_order_id = source_order_id
        await db.flush()
        await db.refresh(current)
        logger.info(
            "activate_subscription: renew user=%s plan=%s new_expires=%s",
            user_id, target_plan.slug, current.expires_at,
        )
        return current

    # 切换不同套餐：旧的标记 cancelled，建一条新的
    if current is not None:
        current.status = "cancelled"

    # Free 永久有效（100 年）；付费套餐按所选周期到期
    expires_at = now + timedelta(days=365 * 100 if is_free else period_days)
    # 加包跟随订阅规则：
    #   - 积分加包 addon_points：永久跟人走，始终保留；
    #   - 存储/账号加包：升级 / 平级 / 降级到「付费套餐」都保留；仅降级到 Free 时才失效。
    downgrade_to_free = target_plan.slug == FREE_PLAN_SLUG
    carry_addon_points = current.addon_points if current is not None else 0
    carry_addon_storage = (
        0 if downgrade_to_free else (current.addon_storage_gb if current is not None else 0)
    )
    carry_addon_domestic = (
        0 if downgrade_to_free else (current.addon_domestic_accounts if current is not None else 0)
    )
    carry_addon_overseas = (
        0 if downgrade_to_free else (current.addon_overseas_accounts if current is not None else 0)
    )
    new_sub = SaasSubscription(
        user_id=user_id,
        plan_slug=target_plan.slug,
        period=selected_period,
        status="active",
        started_at=now,
        expires_at=expires_at,
        source_order_id=source_order_id,
        points_quota=target_plan.points_quota,
        storage_gb_quota=target_plan.storage_gb,
        domestic_accounts_quota=target_plan.domestic_accounts,
        overseas_accounts_quota=target_plan.overseas_accounts,
        # 切套餐时已用量归零（升降级以新周期开始计）
        points_used=0,
        storage_bytes_used=0,
        domestic_accounts_used=0,
        overseas_accounts_used=0,
        addon_points=carry_addon_points,
        # 存储/账号加包：降级到 Free 失效（归 0），升级/平级/降级到付费套餐保留
        addon_storage_gb=carry_addon_storage,
        addon_domestic_accounts=carry_addon_domestic,
        addon_overseas_accounts=carry_addon_overseas,
    )
    db.add(new_sub)
    await db.flush()
    await db.refresh(new_sub)
    logger.info(
        "activate_subscription: switch user=%s old=%s new=%s expires=%s",
        user_id, current.plan_slug if current else None, target_plan.slug, expires_at,
    )
    return new_sub


# ---- 增量包：永久积分发放 ----


async def apply_addon_credit(
    db: AsyncSession,
    *,
    user_id: str,
    addon_id: str | None = None,
    addon_slug: str | None = None,
    quantity: int = 1,
    allow_inactive: bool = False,
) -> SaasSubscription | None:
    """把增量包（加包）发放给用户（注册赠送 / 订单成单时调用）。

    `allow_inactive=True`：用于管理员主动发放（注册赠送 / 后台赠送）。下架(status=inactive)
    的加包默认只是「不可被用户购买」，但仍可作为赠送来源——此时跳过上架校验照常发放。

    按 addon_type 累加到对应池（均与套餐配额相加）：
      - points           → addon_points（永久跟人走，不随订阅周期清零）
      - storage          → addon_storage_gb（付费订阅期间有效；升级/续费/降级到付费套餐都保留，仅降级到 Free / 到期失效）
      - domestic_account → addon_domestic_accounts（同上）
      - overseas_account → addon_overseas_accounts（同上）

    发放数量统一取 addon.points_quota（语义已泛化为「发放数量」）× quantity。
    仅积分类额外写一笔 CreditTransaction 流水（积分专用账本）。
    调用方自行 commit。返回更新后的订阅（未找到 addon / sub 或发放量<=0 返回 None）。
    """
    if addon_id is None and addon_slug is None:
        raise ValueError("apply_addon_credit: addon_id or addon_slug required")
    if quantity <= 0:
        raise ValueError("quantity must be positive")

    stmt = select(SaasAddon)
    if addon_id is not None:
        stmt = stmt.where(SaasAddon.id == addon_id)
    else:
        stmt = stmt.where(SaasAddon.slug == addon_slug)
    addon = (await db.execute(stmt)).scalar_one_or_none()
    if addon is None:
        logger.warning(
            "apply_addon_credit: addon not found id=%s slug=%s", addon_id, addon_slug
        )
        return None
    if not allow_inactive and addon.status != "active":
        logger.warning("apply_addon_credit: addon=%s 已下架且非赠送场景，跳过", addon.slug)
        return None
    grant = int(addon.points_quota) * int(quantity)  # points_quota 现为通用「发放数量」
    if grant <= 0:
        logger.warning("apply_addon_credit: addon=%s 发放数量=0，跳过", addon.slug)
        return None

    sub = await get_active_subscription(db, user_id)
    if sub is None:
        logger.warning("apply_addon_credit: user=%s 无 active 订阅，跳过", user_id)
        return None

    # 按加包类型累加到对应永久池
    atype = addon.addon_type
    if atype == "points":
        sub.addon_points = int(sub.addon_points) + grant
    elif atype == "storage":
        sub.addon_storage_gb = int(sub.addon_storage_gb) + grant
    elif atype == "domestic_account":
        sub.addon_domestic_accounts = int(sub.addon_domestic_accounts) + grant
    elif atype == "overseas_account":
        sub.addon_overseas_accounts = int(sub.addon_overseas_accounts) + grant
    else:
        logger.warning("apply_addon_credit: addon=%s 未知类型 %s，跳过", addon.slug, atype)
        return None

    await db.flush()
    await db.refresh(sub)

    # 仅积分类写积分流水（CreditTransaction 是积分专用账本）
    if atype == "points":
        from app.services import credit_ledger
        await credit_ledger.record_credit(
            db,
            user_id=user_id,
            amount=grant,
            source="addon",
            biz_type="grant_addon",
            biz_ref_type="saas_addon",
            biz_ref_id=str(addon.id),
            balance_after_sub=int(sub.points_quota - sub.points_used),
            balance_after_addon=int(sub.addon_points),
            remark=f"发放增量包「{addon.name}」x{quantity}",
        )

    logger.info(
        "apply_addon_credit: user=%s addon=%s type=%s grant=%s x%s",
        user_id, addon.slug, atype, grant, quantity,
    )
    return sub


# ---- 定时任务：到期处理 ----


async def _downgrade_expired_to_free(
    db: AsyncSession, sub: SaasSubscription, *, now: datetime, free_plan: SaasPlan
) -> SaasSubscription:
    """把一条已到期的非 free 订阅切 expired，并新建一条永久 Free 订阅（永久积分余额跟人走）。

    返回新建的 Free 订阅。供定时任务 expire_due_subscriptions 与读路径惰性到期共用。调用方自行 commit。
    """
    from app.services.notification_service import create_notification

    sub.status = "expired"
    free_sub = SaasSubscription(
        user_id=sub.user_id,
        plan_slug=free_plan.slug,
        period="month",
        status="active",
        started_at=now,
        expires_at=now + timedelta(days=365 * 100),  # Free 永久有效
        points_quota=free_plan.points_quota,
        storage_gb_quota=free_plan.storage_gb,
        domestic_accounts_quota=free_plan.domestic_accounts,
        overseas_accounts_quota=free_plan.overseas_accounts,
        addon_points=sub.addon_points,
        # 存储/账号加包跟随订阅：到期降级后失效（不 carry）
    )
    db.add(free_sub)
    logger.info("downgrade_to_free: user=%s expired_plan=%s", sub.user_id, sub.plan_slug)

    # 站内通知（不影响主流程）
    try:
        await create_notification(
            db,
            user_id=str(sub.user_id),
            type="subscription.expired",
            title="套餐已到期",
            message=f"您的「{sub.plan_slug}」订阅已到期，已自动切换到免费版。续费可继续使用全部权益。",
            link_url="/account/subscription",
            extra={"subscription_id": str(sub.id), "plan_slug": sub.plan_slug},
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("downgrade_to_free notify failed: %s", e)

    await db.flush()
    await db.refresh(free_sub)
    return free_sub


async def lazy_expire_if_due(db: AsyncSession, user_id: str) -> SaasSubscription | None:
    """读路径惰性到期：取用户当前 active 订阅，若为「非 Free 且已过期」则立即降级为永久 Free。

    用于不依赖每日定时任务、在用户请求时即时降级（如 GET /subscription/me、扣积分、传存储前）。
    返回当前应当生效的订阅（可能是刚降级出来的 Free），无订阅返回 None。调用方自行 commit。
    """
    sub = await get_active_subscription(db, user_id)
    if sub is None or sub.plan_slug == FREE_PLAN_SLUG:
        return sub
    if sub.expires_at > utcnow():
        return sub
    free_plan = await _get_plan(db, FREE_PLAN_SLUG)
    return await _downgrade_expired_to_free(db, sub, now=utcnow(), free_plan=free_plan)


async def expire_due_subscriptions(db: AsyncSession) -> int:
    """把已到期的非 free 订阅切为 expired，并降级到 Free。返回处理条数。"""
    now = utcnow()
    r = await db.execute(
        select(SaasSubscription).where(
            SaasSubscription.status == "active",
            SaasSubscription.plan_slug != FREE_PLAN_SLUG,
            SaasSubscription.expires_at <= now,
        )
    )
    expiring = list(r.scalars().all())
    if not expiring:
        return 0
    free_plan = await _get_plan(db, FREE_PLAN_SLUG)
    for sub in expiring:
        await _downgrade_expired_to_free(db, sub, now=now, free_plan=free_plan)
    return len(expiring)


async def migrate_plan_subscribers(db: AsyncSession, from_slug: str, to_slug: str) -> int:
    """把某套餐的所有 active 订阅转换到另一套餐（用于管理员删除套餐时迁移用户）。

    旧订阅置 cancelled，新建一条目标套餐订阅：
    - 配额按目标套餐快照刷新，已用量归零（不超出新配额），永久积分余额跟人走；
    - 目标为 Free 时给永久有效期（100 年）；其它套餐保留原订阅的剩余时长与计费周期快照。

    返回迁移条数。调用方自行 commit。
    """
    if from_slug == to_slug:
        return 0
    target = await _get_plan(db, to_slug)
    now = utcnow()
    r = await db.execute(
        select(SaasSubscription).where(
            SaasSubscription.status == "active",
            SaasSubscription.plan_slug == from_slug,
        )
    )
    affected = list(r.scalars().all())
    if not affected:
        return 0

    from app.services.notification_service import create_notification

    for sub in affected:
        sub.status = "cancelled"
        if to_slug == FREE_PLAN_SLUG:
            new_expires = now + timedelta(days=365 * 100)
            new_period = "month"
        else:
            # 保留剩余时长与计费周期快照
            new_expires = max(sub.expires_at, now)
            new_period = sub.period
        new_sub = SaasSubscription(
            user_id=sub.user_id,
            plan_slug=target.slug,
            period=new_period,
            status="active",
            started_at=now,
            expires_at=new_expires,
            points_quota=target.points_quota,
            storage_gb_quota=target.storage_gb,
            domestic_accounts_quota=target.domestic_accounts,
            overseas_accounts_quota=target.overseas_accounts,
            points_used=0,
            storage_bytes_used=0,
            domestic_accounts_used=0,
            overseas_accounts_used=0,
            addon_points=sub.addon_points,
            # 存储/账号加包：迁移到付费套餐保留，迁移到 Free 失效
            addon_storage_gb=0 if to_slug == FREE_PLAN_SLUG else sub.addon_storage_gb,
            addon_domestic_accounts=0 if to_slug == FREE_PLAN_SLUG else sub.addon_domestic_accounts,
            addon_overseas_accounts=0 if to_slug == FREE_PLAN_SLUG else sub.addon_overseas_accounts,
        )
        db.add(new_sub)
        logger.info(
            "migrate_plan_subscribers: user=%s %s -> %s", sub.user_id, from_slug, to_slug
        )

        # 站内通知（不影响主流程）
        try:
            await create_notification(
                db,
                user_id=str(sub.user_id),
                type="subscription.changed",
                title="套餐已变更",
                message=f"您订阅的「{sub.plan_slug}」套餐已下线，已为您转换到「{target.name}」套餐。",
                link_url="/account/subscription",
                extra={"subscription_id": str(sub.id), "from_plan": sub.plan_slug, "to_plan": target.slug},
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("migrate_plan_subscribers notify failed: %s", e)

    await db.flush()
    return len(affected)


async def sync_plan_quota_to_subscribers(
    db: AsyncSession, plan_slug: str, mode: str = "upgrade_only"
) -> int:
    """把套餐当前额度（积分 / 存储 / 国内外账号）同步到该套餐所有 active 订阅。

    mode:
      - "upgrade_only" 只升不降：各项配额取 max(当前快照, 套餐最新值)，不会缩配额、踢账号；
      - "align" 强制对齐：各项配额直接等于套餐最新值（可能下调，需调用方自行确认风险）。

    不改 已用量 / 永久积分 / 到期日 / 计费周期。返回同步条数。调用方自行 commit。
    """
    plan = await _get_plan(db, plan_slug)
    r = await db.execute(
        select(SaasSubscription).where(
            SaasSubscription.status == "active",
            SaasSubscription.plan_slug == plan_slug,
        )
    )
    subs = list(r.scalars().all())
    for sub in subs:
        if mode == "align":
            sub.points_quota = plan.points_quota
            sub.storage_gb_quota = plan.storage_gb
            sub.domestic_accounts_quota = plan.domestic_accounts
            sub.overseas_accounts_quota = plan.overseas_accounts
        else:  # upgrade_only
            sub.points_quota = max(sub.points_quota, plan.points_quota)
            sub.storage_gb_quota = max(sub.storage_gb_quota, plan.storage_gb)
            sub.domestic_accounts_quota = max(sub.domestic_accounts_quota, plan.domestic_accounts)
            sub.overseas_accounts_quota = max(sub.overseas_accounts_quota, plan.overseas_accounts)
    if subs:
        await db.flush()
    logger.info(
        "sync_plan_quota_to_subscribers: plan=%s mode=%s synced=%d", plan_slug, mode, len(subs)
    )
    return len(subs)
