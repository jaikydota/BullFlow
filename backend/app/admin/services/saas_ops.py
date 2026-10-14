from __future__ import annotations

import random
import string
from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.admin.services.audit_logger import append_audit_log
from app.admin.schemas.saas_admin import (
    AdminAddonGrant,
    AdminAddonOut,
    AdminAddonPayload,
    AdminOrderCreate,
    AdminOrderOut,
    AdminOrderMarkPaid,
    AdminPlanOut,
    AdminPlanPayload,
    AdminSubscriptionGrant,
)

from app.models.saas import SaasAddon, SaasOrder, SaasPlan
from app.models.user import User


def _plan_to_out(row: SaasPlan) -> dict:
    return AdminPlanOut(
        id=str(row.id),
        slug=row.slug,
        name=row.name,
        monthlyPrice=row.monthly_price_cents // 100,
        quarterlyEnabled=bool(row.quarterly_enabled),
        quarterlyPrice=(row.quarterly_price_cents // 100 if row.quarterly_price_cents is not None else None),
        yearlyEnabled=bool(row.yearly_enabled),
        yearlyPrice=(row.yearly_price_cents // 100 if row.yearly_price_cents is not None else None),
        status=row.status,
        tier=int(row.tier or 0),
        pointsQuota=row.points_quota,
        storageGB=row.storage_gb,
        domesticAccounts=row.domestic_accounts,
        overseasAccounts=row.overseas_accounts,
        features=list(row.features or []),
    ).model_dump()


def _addon_to_out(row: SaasAddon) -> dict:
    return AdminAddonOut(
        id=str(row.id),
        slug=row.slug,
        name=row.name,
        type=row.addon_type,
        unit=row.unit_label,
        price=row.price_cents // 100,
        pointsQuota=int(row.points_quota or 0),
        sortOrder=int(row.sort_order or 0),
        status=row.status,
    ).model_dump()


def _order_to_out(row: SaasOrder, plan_name_lookup: dict[str, str]) -> dict:
    paid = row.paid_at.isoformat(timespec="seconds") if row.paid_at else None
    pname = row.plan_slug
    if pname and pname in plan_name_lookup:
        pname_label = plan_name_lookup[pname]
    else:
        pname_label = pname
    return AdminOrderOut(
        id=str(row.id),
        orderNo=row.order_no,
        tenantId=str(row.user_id),
        tenantName=row.tenant_display_name,
        type=row.order_type,
        amount=row.amount_cents // 100,
        payMethod=row.pay_method,
        payChannel=getattr(row, "pay_channel", None),
        payTypeCode=getattr(row, "pay_type_code", None),
        gatewayTrxid=getattr(row, "gateway_trxid", None),
        status=row.status,
        description=row.description,
        planName=pname_label,
        actualRevenue=(
            row.actual_revenue_cents // 100 if row.actual_revenue_cents is not None else None
        ),
        remark=row.remark,
        voucherUrl=getattr(row, "voucher_url", None),
        createdAt=row.created_at.isoformat(timespec="seconds") if row.created_at else None,
        paidAt=paid,
    ).model_dump()


def _generate_order_no() -> str:
    return "ORD-" + datetime.utcnow().strftime("%Y%m%d") + "".join(random.choices(string.digits, k=6))


def _random_code(length: int = 8) -> str:
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=length))


async def plan_name_map(db: AsyncSession) -> dict[str, str]:
    r = await db.execute(select(SaasPlan.slug, SaasPlan.name))
    return {s: n for s, n in r.all()}


async def list_plans(db: AsyncSession) -> list[dict]:
    r = await db.execute(
        select(SaasPlan).order_by(SaasPlan.tier.asc(), SaasPlan.monthly_price_cents.asc())
    )
    return [_plan_to_out(x) for x in r.scalars().all()]


async def upsert_plan(db: AsyncSession, body: AdminPlanPayload, *, operator_id: str | None = None) -> dict:
    row = (
        await db.execute(select(SaasPlan).where(SaasPlan.slug == body.slug))
    ).scalar_one_or_none()
    data = dict(
        slug=body.slug,
        name=body.name,
        monthly_price_cents=body.monthly_price_yuan * 100,
        quarterly_enabled=body.quarterly_enabled,
        quarterly_price_cents=(body.quarterly_price_yuan * 100 if body.quarterly_price_yuan is not None else None),
        yearly_enabled=body.yearly_enabled,
        yearly_price_cents=(body.yearly_price_yuan * 100 if body.yearly_price_yuan is not None else None),
        status=body.status,
        tier=body.tier,
        points_quota=body.points_quota,
        storage_gb=body.storage_gb,
        domestic_accounts=body.domestic_accounts,
        overseas_accounts=body.overseas_accounts,
        features=body.features or [],
    )
    if row is None:
        row = SaasPlan(**data)
        db.add(row)
    else:
        for k, v in data.items():
            setattr(row, k, v)
    await db.flush()
    await db.refresh(row)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="saas.plan.upsert",
            resource_type="saas_plan",
            resource_id=body.slug,
        )
    return _plan_to_out(row)


# Free 套餐 slug（与 C 端 saas_subscription.FREE_PLAN_SLUG 一致）
FREE_PLAN_SLUG = "free"


async def delete_plan(
    db: AsyncSession, slug: str, *, target_slug: str, operator_id: str | None = None
) -> dict:
    """删除套餐。Free 套餐不可删除；删除前把使用该套餐的用户转换到 target_slug 套餐。

    返回 {slug, target_slug, migrated}（migrated=被转换的用户数）。调用方/外层 commit。
    """
    if slug == FREE_PLAN_SLUG:
        raise ConflictError("Free 套餐不可删除")
    if not target_slug:
        raise ConflictError("请选择用户转换到的目标套餐")
    if target_slug == slug:
        raise ConflictError("目标套餐不能是被删除的套餐")

    row = (await db.execute(select(SaasPlan).where(SaasPlan.slug == slug))).scalar_one_or_none()
    if row is None:
        raise NotFoundError("套餐不存在")

    target = (
        await db.execute(select(SaasPlan).where(SaasPlan.slug == target_slug))
    ).scalar_one_or_none()
    if target is None:
        raise NotFoundError("目标套餐不存在")

    # 先把当前在用该套餐的订阅转换到目标套餐（旧订阅 cancelled + 新建目标套餐订阅，永久积分跟人走）
    from app.services import saas_subscription

    migrated = await saas_subscription.migrate_plan_subscribers(db, slug, target_slug)

    await db.delete(row)
    await db.flush()
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="saas.plan.delete",
            resource_type="saas_plan",
            resource_id=slug,
            detail={"target_slug": target_slug, "migrated_users": migrated},
        )
    return {"slug": slug, "target_slug": target_slug, "migrated": migrated}


async def sync_plan_quota(
    db: AsyncSession, slug: str, *, mode: str, operator_id: str | None = None
) -> dict:
    """把套餐当前额度同步到该套餐所有 active 订阅。

    mode: upgrade_only(只升不降) / align(强制对齐)。返回 {slug, mode, synced}。
    """
    if mode not in ("upgrade_only", "align"):
        raise ConflictError("mode 仅支持 upgrade_only / align")
    row = (await db.execute(select(SaasPlan).where(SaasPlan.slug == slug))).scalar_one_or_none()
    if row is None:
        raise NotFoundError("套餐不存在")

    from app.services import saas_subscription

    synced = await saas_subscription.sync_plan_quota_to_subscribers(db, slug, mode)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="saas.plan.sync_quota",
            resource_type="saas_plan",
            resource_id=slug,
            detail={"mode": mode, "synced": synced},
        )
    return {"slug": slug, "mode": mode, "synced": synced}


async def list_addons(
    db: AsyncSession, *, addon_type: str | None = None
) -> list[dict]:
    stmt = select(SaasAddon).order_by(SaasAddon.sort_order.asc(), SaasAddon.price_cents.asc())
    if addon_type:
        stmt = stmt.where(SaasAddon.addon_type == addon_type)
    r = await db.execute(stmt)
    return [_addon_to_out(x) for x in r.scalars().all()]


async def upsert_addon(
    db: AsyncSession, body: AdminAddonPayload, *, operator_id: str | None = None
) -> dict:
    row = (
        await db.execute(select(SaasAddon).where(SaasAddon.slug == body.slug))
    ).scalar_one_or_none()
    data = dict(
        slug=body.slug,
        name=body.name,
        addon_type=body.type,
        unit_label=body.unit,
        price_cents=body.price_yuan * 100,
        # 单份发放数量（语义随类型：积分数 / GB / 账号数）
        points_quota=body.points_quota,
        sort_order=body.sort_order,
        status=body.status,
    )
    if row is None:
        row = SaasAddon(**data)
        db.add(row)
    else:
        for k, v in data.items():
            setattr(row, k, v)
    await db.flush()
    await db.refresh(row)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="saas.addon.upsert",
            resource_type="saas_addon",
            resource_id=body.slug,
        )
    return _addon_to_out(row)


async def delete_addon(
    db: AsyncSession, slug: str, *, operator_id: str | None = None
) -> dict:
    """删除增值服务 / 加包。

    增值服务不像套餐那样被订阅快照持续引用（积分类一次性发放后只在 credit_transactions
    里留 biz_ref_id 历史值，非外键），故可直接硬删除，不需要迁移用户。返回 {slug}。
    调用方/外层 commit。
    """
    row = (
        await db.execute(select(SaasAddon).where(SaasAddon.slug == slug))
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("增值服务不存在")
    await db.delete(row)
    await db.flush()
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="saas.addon.delete",
            resource_type="saas_addon",
            resource_id=slug,
        )
    return {"slug": slug}


async def list_orders(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
    search: str | None,
    order_type: str | None,
    status: str | None,
) -> tuple[list[dict], int]:
    q = select(SaasOrder)
    cq = select(func.count()).select_from(SaasOrder)
    if search:
        like = f"%{search}%"
        f = SaasOrder.order_no.like(like) | func.coalesce(SaasOrder.tenant_display_name, "").like(
            like
        )
        q = q.where(f)
        cq = cq.where(f)
    if order_type:
        q = q.where(SaasOrder.order_type == order_type)
        cq = cq.where(SaasOrder.order_type == order_type)
    if status:
        q = q.where(SaasOrder.status == status)
        cq = cq.where(SaasOrder.status == status)

    total = int((await db.execute(cq)).scalar() or 0)
    q = q.order_by(SaasOrder.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = list((await db.execute(q)).scalars().all())
    pmap = await plan_name_map(db)
    return [_order_to_out(r, pmap) for r in rows], total


async def create_order(
    db: AsyncSession,
    body: AdminOrderCreate,
    *,
    operator_id: str | None = None,
) -> dict:
    uid = body.user_id
    urow = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if urow is None:
        raise NotFoundError("租户用户不存在")

    order_no = _generate_order_no()
    for _ in range(8):
        ex = (
            await db.execute(select(SaasOrder).where(SaasOrder.order_no == order_no))
        ).scalar_one_or_none()
        if ex is None:
            break
        order_no = _generate_order_no()

    # 按支付方式推导 pay_channel，保持与 C 端一致（对公=transfer，线下=offline，扫码=allinpay）
    pay_channel = {
        "alipay": "allinpay",
        "wechat": "allinpay",
        "transfer": "transfer",
        "offline": "offline",
    }.get(body.pay_method, "offline")
    row = SaasOrder(
        order_no=order_no,
        user_id=uid,
        tenant_display_name=body.tenant_display_name or urow.nickname or urow.email,
        order_type=body.order_type,
        amount_cents=body.amount_yuan * 100,
        pay_method=body.pay_method,
        pay_channel=pay_channel,
        status="pending",
        description=body.description,
        plan_slug=body.plan_slug,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    pmap = await plan_name_map(db)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="saas.order.create",
            resource_type="saas_order",
            resource_id=str(row.id),
            detail={"order_no": row.order_no},
        )
    return _order_to_out(row, pmap)


async def grant_subscription(
    db: AsyncSession,
    body: AdminSubscriptionGrant,
    *,
    operator_id: str | None = None,
) -> dict:
    """内部开通套餐：建一条已支付订单并激活订阅。返回订单 dict。调用方/外层 commit。"""
    from app.services import saas_subscription

    urow = (await db.execute(select(User).where(User.id == body.user_id))).scalar_one_or_none()
    if urow is None:
        raise NotFoundError("目标用户不存在")
    plan = (
        await db.execute(select(SaasPlan).where(SaasPlan.slug == body.plan_slug))
    ).scalar_one_or_none()
    if plan is None:
        raise NotFoundError("套餐不存在")

    if body.billing_period not in saas_subscription.available_periods(plan):
        raise ConflictError(f"套餐「{plan.name}」未开放 {body.billing_period} 计费周期")

    amount_cents = (
        body.amount_yuan * 100
        if body.amount_yuan is not None
        else saas_subscription.period_price_cents(plan, body.billing_period)
    )

    order_no = _generate_order_no()
    for _ in range(8):
        ex = (
            await db.execute(select(SaasOrder).where(SaasOrder.order_no == order_no))
        ).scalar_one_or_none()
        if ex is None:
            break
        order_no = _generate_order_no()

    now = datetime.utcnow()
    row = SaasOrder(
        order_no=order_no,
        user_id=body.user_id,
        tenant_display_name=urow.nickname or urow.email,
        order_type="subscription",
        amount_cents=amount_cents,
        pay_method=body.pay_method,
        pay_channel="offline",
        status="paid",
        plan_slug=plan.slug,
        subscription_period=body.billing_period,
        actual_revenue_cents=amount_cents,
        description=f"内部开通 {plan.name}",
        remark=body.remark,
        paid_at=now,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)

    await saas_subscription.activate_subscription(
        db,
        user_id=body.user_id,
        target_plan=plan,
        selected_period=body.billing_period,
        source_order_id=row.id,
    )

    pmap = await plan_name_map(db)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="saas.subscription.grant",
            resource_type="saas_order",
            resource_id=str(row.id),
            detail={
                "user_id": body.user_id,
                "plan_slug": plan.slug,
                "billing_period": body.billing_period,
                "amount_cents": amount_cents,
            },
        )
    return _order_to_out(row, pmap)


async def grant_addon(
    db: AsyncSession,
    body: AdminAddonGrant,
    *,
    operator_id: str | None = None,
) -> dict:
    """赠送增量包：把增量包额度发放给用户，并建一条 amount=0 的已支付订单（记录/对账）。

    返回订单 dict。调用方/外层 commit。
    """
    from app.services import saas_subscription

    urow = (await db.execute(select(User).where(User.id == body.user_id))).scalar_one_or_none()
    if urow is None:
        raise NotFoundError("目标用户不存在")
    addon = (
        await db.execute(select(SaasAddon).where(SaasAddon.slug == body.addon_slug))
    ).scalar_one_or_none()
    if addon is None:
        raise NotFoundError("增量包不存在")
    if addon.status != "active":
        raise ConflictError(f"增量包「{addon.name}」已下架，无法赠送")

    sub = await saas_subscription.get_active_subscription(db, body.user_id)
    if sub is None:
        raise ConflictError("该用户当前无生效订阅，无法发放增量包")

    order_no = _generate_order_no()
    for _ in range(8):
        ex = (
            await db.execute(select(SaasOrder).where(SaasOrder.order_no == order_no))
        ).scalar_one_or_none()
        if ex is None:
            break
        order_no = _generate_order_no()

    now = datetime.utcnow()
    row = SaasOrder(
        order_no=order_no,
        user_id=body.user_id,
        tenant_display_name=urow.nickname or urow.email,
        order_type="value_added",
        amount_cents=0,
        pay_method="offline",
        pay_channel="offline",
        status="paid",
        addon_slug=addon.slug,
        addon_quantity=body.quantity,
        actual_revenue_cents=0,
        description=f"赠送增量包 {addon.name} ×{body.quantity}",
        remark=body.remark,
        paid_at=now,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)

    applied = await saas_subscription.apply_addon_credit(
        db, user_id=body.user_id, addon_slug=addon.slug, quantity=body.quantity
    )
    if applied is None:
        raise ConflictError("增量包发放失败（增量包不可用或用户无生效订阅）")

    pmap = await plan_name_map(db)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="saas.addon.grant",
            resource_type="saas_order",
            resource_id=str(row.id),
            detail={"user_id": body.user_id, "addon_slug": addon.slug, "quantity": body.quantity},
        )
    return _order_to_out(row, pmap)


async def mark_order_paid(
    db: AsyncSession,
    order_id: str,
    body: AdminOrderMarkPaid,
    *,
    operator_id: str | None = None,
) -> dict:
    """确认到账并核销订单：置 paid 后**按订单类型激活订阅 / 发放加包**。

    这是对公转账、线下单的核销闭环——与 grant_subscription / grant_addon 同款发放逻辑。
    幂等：已 paid 的订单不重复激活。调用方/外层 commit。
    """
    from app.services import saas_subscription

    row = (await db.execute(select(SaasOrder).where(SaasOrder.id == order_id))).scalar_one_or_none()
    if row is None:
        raise NotFoundError("订单不存在")
    if row.status == "paid":
        return _order_to_out(row, await plan_name_map(db))  # 幂等：已核销不重复发放
    if row.status not in ("pending", "reviewing"):
        raise ConflictError("仅待支付 / 待核销订单可核销")

    revenue_yuan = body.actual_revenue_yuan
    if revenue_yuan is None:
        revenue_yuan = row.amount_cents // 100

    row.status = "paid"
    row.paid_at = datetime.utcnow()
    row.actual_revenue_cents = revenue_yuan * 100
    if body.voucher_url:  # 财务可补充凭证；不覆盖用户已上传的
        row.voucher_url = body.voucher_url
    if body.remark is not None:
        row.remark = body.remark
    await db.flush()

    # 核销后发放权益
    if row.order_type == "subscription" and row.plan_slug:
        plan = (
            await db.execute(select(SaasPlan).where(SaasPlan.slug == row.plan_slug))
        ).scalar_one_or_none()
        if plan is not None:
            await saas_subscription.activate_subscription(
                db, user_id=str(row.user_id), target_plan=plan,
                selected_period=row.subscription_period or "month",
                source_order_id=row.id,
            )
    elif row.order_type == "value_added" and row.addon_slug:
        await saas_subscription.apply_addon_credit(
            db, user_id=str(row.user_id), addon_slug=row.addon_slug,
            quantity=int(row.addon_quantity or 1),
        )

    # 邀请有礼·二阶：被邀请人通过对公转账等真实充值核销成功 → 发二阶奖励给邀请人（幂等；失败不阻塞核销）
    try:
        from app.services import referral_service

        await referral_service.grant_tier2_on_recharge(db, str(row.user_id))
    except Exception:
        import logging

        logging.getLogger(__name__).warning(
            "[REFERRAL] tier2 (mark_paid) failed order=%s", row.order_no, exc_info=True
        )

    # 对公转账核销通过：通知用户
    if row.pay_method == "transfer":
        try:
            from app.services.notification_service import create_notification

            await create_notification(
                db, user_id=str(row.user_id),
                type="order.transfer_approved",
                title="对公转账核销通过",
                message=f"订单 {row.order_no} 的转账已核实到账，权益已开通。",
                link_url="/account/subscription",
                extra={"order_no": row.order_no},
            )
        except Exception:  # noqa: BLE001
            pass

    await db.refresh(row)
    pmap = await plan_name_map(db)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="saas.order.mark_paid",
            resource_type="saas_order",
            resource_id=str(row.id),
            detail={"order_no": row.order_no},
        )
    return _order_to_out(row, pmap)


async def reject_transfer_order(
    db: AsyncSession,
    order_id: str,
    reason: str,
    *,
    operator_id: str | None = None,
) -> dict:
    """驳回对公转账核销：reviewing → pending，写驳回原因并通知用户重新提交。调用方/外层 commit。"""
    row = (await db.execute(select(SaasOrder).where(SaasOrder.id == order_id))).scalar_one_or_none()
    if row is None:
        raise NotFoundError("订单不存在")
    if row.status != "reviewing":
        raise ConflictError("仅「待核销」订单可驳回")
    row.status = "pending"
    row.remark = reason
    await db.flush()

    try:
        from app.services.notification_service import create_notification

        await create_notification(
            db, user_id=str(row.user_id),
            type="order.transfer_rejected",
            title="对公转账核销未通过",
            message=f"订单 {row.order_no} 的转账核销未通过：{reason}。请核对后重新提交。",
            link_url="/account/subscription",
            extra={"order_no": row.order_no, "reason": reason},
        )
    except Exception:  # noqa: BLE001
        pass

    await db.refresh(row)
    pmap = await plan_name_map(db)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="saas.order.reject_transfer",
            resource_type="saas_order",
            resource_id=str(row.id),
            detail={"order_no": row.order_no, "reason": reason},
        )
    return _order_to_out(row, pmap)


async def cancel_order(
    db: AsyncSession,
    order_id: str,
    *,
    operator_id: str | None = None,
) -> dict:
    row = (await db.execute(select(SaasOrder).where(SaasOrder.id == order_id))).scalar_one_or_none()
    if row is None:
        raise NotFoundError("订单不存在")
    row.status = "cancelled"
    await db.flush()
    await db.refresh(row)
    pmap = await plan_name_map(db)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="saas.order.cancel",
            resource_type="saas_order",
            resource_id=str(row.id),
        )
    return _order_to_out(row, pmap)

async def refund_order(
    db: AsyncSession,
    order_id: str,
    remark: str | None = None,
    *,
    operator_id: str | None = None,
) -> dict:
    row = (await db.execute(select(SaasOrder).where(SaasOrder.id == order_id))).scalar_one_or_none()
    if row is None:
        raise NotFoundError("订单不存在")
    row.status = "refunded"
    if remark:
        row.remark = remark
    await db.flush()
    await db.refresh(row)
    pmap = await plan_name_map(db)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="saas.order.refund",
            resource_type="saas_order",
            resource_id=str(row.id),
            detail={"remark": remark},
        )
    return _order_to_out(row, pmap)


async def finance_monthly(db: AsyncSession) -> list[dict]:
    """基于已支付订单的 paid_at 月份聚合（金额按实收 cents，输出为元）。"""
    try:
        paid_rev = func.coalesce(SaasOrder.actual_revenue_cents, SaasOrder.amount_cents)

        ym = func.date_format(SaasOrder.paid_at, "%Y-%m")

        recharge_sum = func.sum(
            case((SaasOrder.order_type == "recharge", paid_rev), else_=0),
        )
        sub_sum = func.sum(
            case((SaasOrder.order_type == "subscription", paid_rev), else_=0),
        )
        vas_sum = func.sum(
            case((SaasOrder.order_type == "value_added", paid_rev), else_=0),
        )
        stmt = (
            select(
                ym.label("month"),
                func.count(SaasOrder.id).label("order_count"),
                func.coalesce(func.sum(paid_rev), 0).label("revenue_cents"),
                recharge_sum.label("recharge_cents"),
                sub_sum.label("sub_cents"),
                vas_sum.label("vas_cents"),
            )
            .where(SaasOrder.status == "paid", SaasOrder.paid_at.is_not(None))
            .group_by(ym)
            .order_by(ym.desc())
            .limit(24)
        )
        r = await db.execute(stmt)
        rows_out: list[dict] = []
        for mo, oc, tc, rc, sc, vc in r.all():
            rows_out.append(
                {
                    "month": mo,
                    "orderCount": int(oc or 0),
                    "revenue": int((tc or 0) // 100),
                    "pointsRecharge": int((rc or 0) // 100),
                    "subscriptionRevenue": int((sc or 0) // 100),
                    "valueAddedRevenue": int((vc or 0) // 100),
                }
            )
        return list(reversed(rows_out))
    except SQLAlchemyError:
        await db.rollback()
        return []
