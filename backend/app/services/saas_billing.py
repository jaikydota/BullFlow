"""订单 + 通联支付集成 service。

关键流程：
- create_order: 计算差价 → 生成订单(pending) → 调通联下单拿 qrcode → 写回字段
- poll_order_status: 前端轮询触发，可同步问通联查单
- cancel_order: 用户主动取消 pending 订单
- handle_allinpay_callback: 通联异步回调入口，验签后激活订阅
- expire_pending_orders: 定时任务，pending 超时改 cancelled
"""
from __future__ import annotations

import logging
import secrets
import string
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow

from app.core.config import settings
from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.saas import SaasAddon, SaasInvoice, SaasOrder, SaasPlan
from app.models.user import User
from app.services import saas_subscription
from app.utils.allinpay_client import allinpay_client
from app.utils.allinpay_sign import verify_sign

logger = logging.getLogger(__name__)

# ---- 常量 ----

_PAYTYPE_MAP = {
    "alipay": settings.ALLINPAY_DEFAULT_ALIPAY_PAYTYPE,
    "wechat": settings.ALLINPAY_DEFAULT_WECHAT_PAYTYPE,
}

# 对公转账订单有效期（天）：企业转账走流程较慢，给足时间；且 expire 任务只清通联单、不清对公
_TRANSFER_EXPIRE_DAYS = 30


def _generate_order_no() -> str:
    """订单号：ORD<yyyyMMddHHmmss><6 随机数字>，长度 23。"""
    ts = utcnow().strftime("%Y%m%d%H%M%S")
    rand = "".join(secrets.choice(string.digits) for _ in range(6))
    return f"ORD{ts}{rand}"


async def _get_plan(db: AsyncSession, slug: str) -> SaasPlan:
    r = await db.execute(select(SaasPlan).where(SaasPlan.slug == slug))
    plan = r.scalar_one_or_none()
    if plan is None:
        raise NotFoundError(f"套餐 {slug} 不存在")
    if plan.status != "active":
        raise BadRequestError(f"套餐 {slug} 已下架")
    return plan


async def _get_addon(db: AsyncSession, slug: str) -> SaasAddon:
    r = await db.execute(select(SaasAddon).where(SaasAddon.slug == slug))
    addon = r.scalar_one_or_none()
    if addon is None:
        raise NotFoundError(f"增量包 {slug} 不存在")
    if addon.status != "active":
        raise BadRequestError(f"增量包 {addon.name} 已下架")
    return addon


# ---- 下单 ----


async def create_order(
    db: AsyncSession,
    *,
    user: User,
    plan_slug: str,
    billing_period: str,
    pay_method: str,
) -> dict[str, Any]:
    """创建订单并调通联下单，返回 schemas.billing.OrderCreateResult 兼容 dict。"""
    is_transfer = pay_method == "transfer"
    if not is_transfer and pay_method not in _PAYTYPE_MAP:
        raise BadRequestError("仅支持 alipay / wechat / transfer")
    if plan_slug == saas_subscription.FREE_PLAN_SLUG:
        raise BadRequestError("Free 套餐无需付费，注册即享")

    plan = await _get_plan(db, plan_slug)
    if billing_period not in saas_subscription.available_periods(plan):
        raise BadRequestError(f"套餐 {plan.name} 未开放 {billing_period} 计费周期")
    quote = await saas_subscription.compute_quote(db, user.id, plan_slug, billing_period)
    payable = int(quote["payable_cents"])
    now = utcnow()
    order_no = _generate_order_no()
    paytype = "" if is_transfer else _PAYTYPE_MAP[pay_method]
    expires_at = (
        now + timedelta(days=_TRANSFER_EXPIRE_DAYS)
        if is_transfer
        else now + timedelta(minutes=settings.SUBSCRIPTION_ORDER_TIMEOUT_MINUTES)
    )

    order = SaasOrder(
        order_no=order_no,
        user_id=user.id,
        tenant_display_name=user.nickname or user.email,
        order_type="subscription",
        amount_cents=payable,
        pay_method=pay_method,
        pay_channel="transfer" if is_transfer else "allinpay",
        pay_type_code=paytype or None,
        gateway_reqsn=None if is_transfer else order_no,
        status="pending",
        plan_slug=plan.slug,
        subscription_period=billing_period,
        description=f"{plan.name}（{quote['action']}）",
        expires_at=expires_at,
    )
    db.add(order)
    await db.flush()
    await db.refresh(order)

    # 差价为 0 时直接激活，不走支付（无论支付方式）
    if payable <= 0:
        order.status = "paid"
        order.paid_at = now
        order.actual_revenue_cents = 0
        await saas_subscription.activate_subscription(
            db, user_id=user.id, target_plan=plan,
            selected_period=billing_period, source_order_id=order.id,
        )
        await db.commit()
        return {
            "order_no": order.order_no,
            "plan_slug": plan.slug,
            "amount_cents": 0,
            "pay_method": pay_method,
            "pay_type_code": paytype,
            "qrcode_url": None,
            "expires_at": expires_at,
            "status": "paid",
            "auto_activated": True,
        }

    # 对公转账：建待核销订单（pending），不调通联、无二维码；用户线下转账后提交核销
    if is_transfer:
        await db.commit()
        return {
            "order_no": order.order_no,
            "plan_slug": plan.slug,
            "amount_cents": payable,
            "pay_method": pay_method,
            "pay_type_code": "",
            "qrcode_url": None,
            "expires_at": expires_at,
            "status": "pending",
            "auto_activated": False,
        }

    # 扫码：调通联下单 —— validtime 是"以分钟为单位的整数"（见 doc/256 字段定义）
    try:
        gw = await allinpay_client.unified_order(
            order_no=order_no,
            amount_cents=payable,
            paytype=paytype,
            body=f"{plan.name} 订阅",
            validtime_minutes=settings.SUBSCRIPTION_ORDER_TIMEOUT_MINUTES,
        )
    except Exception:
        # 通联失败时把订单留作 pending（不立刻取消，允许重试），但不返回二维码
        logger.exception("create_order: 通联下单失败 order_no=%s", order_no)
        await db.commit()
        raise

    order.gateway_trxid = gw.get("trxid")
    order.qrcode_url = gw.get("payinfo")
    order.gateway_raw = {"create": gw}
    await db.commit()

    return {
        "order_no": order.order_no,
        "plan_slug": plan.slug,
        "amount_cents": payable,
        "pay_method": pay_method,
        "pay_type_code": paytype,
        "qrcode_url": order.qrcode_url,
        "expires_at": expires_at,
        "status": "pending",
        "auto_activated": False,
    }


# ---- 增量包下单 ----


async def create_addon_order(
    db: AsyncSession,
    *,
    user: User,
    addon_slug: str,
    quantity: int,
    pay_method: str,
) -> dict[str, Any]:
    """创建增量包（加包）订单并调通联下单，返回 schemas.billing.OrderCreateResult 兼容 dict。

    加包按全价 × 份数收费（无差价抵扣），支付成功后由 _apply_gateway_paid 调
    apply_addon_credit 发放到对应永久池。
    """
    is_transfer = pay_method == "transfer"
    if not is_transfer and pay_method not in _PAYTYPE_MAP:
        raise BadRequestError("仅支持 alipay / wechat / transfer")
    quantity = int(quantity)
    if quantity <= 0:
        raise BadRequestError("购买份数必须 ≥ 1")

    addon = await _get_addon(db, addon_slug)
    payable = int(addon.price_cents) * quantity
    now = utcnow()
    order_no = _generate_order_no()
    paytype = "" if is_transfer else _PAYTYPE_MAP[pay_method]
    expires_at = (
        now + timedelta(days=_TRANSFER_EXPIRE_DAYS)
        if is_transfer
        else now + timedelta(minutes=settings.SUBSCRIPTION_ORDER_TIMEOUT_MINUTES)
    )

    order = SaasOrder(
        order_no=order_no,
        user_id=user.id,
        tenant_display_name=user.nickname or user.email,
        order_type="value_added",
        amount_cents=payable,
        pay_method=pay_method,
        pay_channel="transfer" if is_transfer else "allinpay",
        pay_type_code=paytype or None,
        gateway_reqsn=None if is_transfer else order_no,
        status="pending",
        plan_slug=None,
        addon_slug=addon.slug,
        addon_quantity=quantity,
        description=f"{addon.name} ×{quantity}",
        expires_at=expires_at,
    )
    db.add(order)
    await db.flush()
    await db.refresh(order)

    # 免费加包（价格 0）直接发放，不走支付
    if payable <= 0:
        order.status = "paid"
        order.paid_at = now
        order.actual_revenue_cents = 0
        await saas_subscription.apply_addon_credit(
            db, user_id=user.id, addon_slug=addon.slug, quantity=quantity,
        )
        await db.commit()
        return {
            "order_no": order.order_no,
            "addon_slug": addon.slug,
            "quantity": quantity,
            "amount_cents": 0,
            "pay_method": pay_method,
            "pay_type_code": paytype,
            "qrcode_url": None,
            "expires_at": expires_at,
            "status": "paid",
            "auto_activated": True,
        }

    # 对公转账：建待核销订单（pending），不调通联、无二维码
    if is_transfer:
        await db.commit()
        return {
            "order_no": order.order_no,
            "addon_slug": addon.slug,
            "quantity": quantity,
            "amount_cents": payable,
            "pay_method": pay_method,
            "pay_type_code": "",
            "qrcode_url": None,
            "expires_at": expires_at,
            "status": "pending",
            "auto_activated": False,
        }

    try:
        gw = await allinpay_client.unified_order(
            order_no=order_no,
            amount_cents=payable,
            paytype=paytype,
            body=f"{addon.name} 加包",
            validtime_minutes=settings.SUBSCRIPTION_ORDER_TIMEOUT_MINUTES,
        )
    except Exception:
        logger.exception("create_addon_order: 通联下单失败 order_no=%s", order_no)
        await db.commit()
        raise

    order.gateway_trxid = gw.get("trxid")
    order.qrcode_url = gw.get("payinfo")
    order.gateway_raw = {"create": gw}
    await db.commit()

    return {
        "order_no": order.order_no,
        "addon_slug": addon.slug,
        "quantity": quantity,
        "amount_cents": payable,
        "pay_method": pay_method,
        "pay_type_code": paytype,
        "qrcode_url": order.qrcode_url,
        "expires_at": expires_at,
        "status": "pending",
        "auto_activated": False,
    }


# ---- 查询 / 列表 / 取消 ----


async def get_order_by_no(db: AsyncSession, order_no: str, user_id: str) -> SaasOrder:
    r = await db.execute(
        select(SaasOrder).where(
            SaasOrder.order_no == order_no, SaasOrder.user_id == user_id
        )
    )
    order = r.scalar_one_or_none()
    if order is None:
        raise NotFoundError("订单不存在")
    return order


async def get_and_sync_order(
    db: AsyncSession, order_no: str, user_id: str
) -> SaasOrder:
    """查订单并同步通联远端状态。

    适用场景：开发环境没有公网回调地址，前端轮询此接口时主动去通联查单。
    生产环境也会调用（兜底），但 webhook 已经会先把状态置 paid，此处只是幂等。
    """
    order = await get_order_by_no(db, order_no, user_id)

    if (
        order.status == "pending"
        and order.pay_channel == "allinpay"
        and order.gateway_reqsn
    ):
        try:
            data = await allinpay_client.query_order(order_no=order.gateway_reqsn)
            await _apply_gateway_paid(db, order, data, source="query")
            await db.commit()
            # 重新拉一次以反映最新 status
            await db.refresh(order)
        except Exception:
            # 查单失败不阻塞前端拿到当前状态
            logger.exception("get_and_sync_order: query failed order=%s", order_no)
    return order


async def cancel_order(db: AsyncSession, order_no: str, user_id: str) -> SaasOrder:
    order = await get_order_by_no(db, order_no, user_id)
    if order.status not in ("pending", "reviewing"):
        raise ConflictError("订单状态已变更，无法取消")
    order.status = "cancelled"
    await db.commit()
    return order


async def _notify_finance_sms(db: AsyncSession, *, kind: str, order_no: str) -> None:
    """用户发起对公核销 / 开票申请时，给所有「有手机号的在职财务」发短信提醒上平台审核。

    受平台设置 finance_sms_notification 开关控制；kind: transfer / invoice。失败不阻塞主流程。
    """
    try:
        from app.models.admin_platform import PlatformSetting

        cfg = (
            await db.execute(
                select(PlatformSetting.value).where(
                    PlatformSetting.key == "finance_sms_notification"
                )
            )
        ).scalar_one_or_none()
        cfg = cfg if isinstance(cfg, dict) else {}
        if not cfg.get("enabled", False):
            return
        if kind == "transfer" and not cfg.get("transfer_notification", True):
            return
        if kind == "invoice" and not cfg.get("invoice_notification", True):
            return

        phones = [
            p
            for p in (
                await db.execute(
                    select(User.phone).where(
                        User.role == "finance",
                        User.phone.isnot(None),
                        User.status == "active",
                    )
                )
            )
            .scalars()
            .all()
            if p
        ]
        if not phones:
            return

        from app.services import sms_service

        if kind == "transfer":
            content = f"{settings.SMS_SIGNATURE}有用户提交对公转账核销申请（订单{order_no}），请登录管理后台审核。"
        else:
            content = f"{settings.SMS_SIGNATURE}有用户提交开票申请（订单{order_no}），请登录管理后台开具。"
        await sms_service.send_sms_batch(phones, content)
        logger.info("_notify_finance_sms: kind=%s order=%s sent=%d", kind, order_no, len(phones))
    except Exception:
        logger.exception("_notify_finance_sms failed kind=%s order=%s", kind, order_no)


async def submit_transfer(
    db: AsyncSession,
    order_no: str,
    user_id: str,
    *,
    voucher_url: str | None = None,
    remark: str | None = None,
) -> SaasOrder:
    """用户「我已转账」：把本人对公 pending 订单置 reviewing（待核销）。

    凭证可选；幂等（已 reviewing 时允许补传凭证 / 备注）。被驳回退回 pending 后可重新提交。
    """
    order = await get_order_by_no(db, order_no, user_id)
    if order.pay_method != "transfer":
        raise BadRequestError("非对公转账订单")
    if order.status not in ("pending", "reviewing"):
        raise ConflictError("订单状态已变更，无法提交核销")
    was_pending = order.status == "pending"
    order.status = "reviewing"
    if voucher_url:
        order.voucher_url = voucher_url
    if remark is not None:
        order.remark = remark
    await db.commit()
    await db.refresh(order)
    # 仅首次提交（pending→reviewing）时通知财务，补传凭证不重复发
    if was_pending:
        await _notify_finance_sms(db, kind="transfer", order_no=order.order_no)
    return order


async def list_user_orders(
    db: AsyncSession, user_id: str, *, page: int, page_size: int
) -> tuple[list[SaasOrder], int]:
    from sqlalchemy import func

    base = select(SaasOrder).where(SaasOrder.user_id == user_id)
    total = (
        await db.execute(
            select(func.count()).select_from(base.subquery())
        )
    ).scalar_one()
    r = await db.execute(
        base.order_by(SaasOrder.created_at.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    return list(r.scalars().all()), int(total or 0)


# ---- 发票 ----


async def apply_invoice(
    db: AsyncSession,
    order_no: str,
    user_id: str,
    payload: Any,  # schemas.billing.InvoiceApplyPayload
) -> SaasInvoice:
    """用户对已支付订单申请开票。

    校验订单存在 + 属本人 + status=='paid'。一订单一票：
    - 已有 pending / issued 发票 → ConflictError
    - 已有 rejected 发票 → 复用同一行重新申请（置回 pending、清驳回原因）
    开票金额取订单实收 actual_revenue_cents（None 回退 amount_cents）。commit。
    """
    order = await get_order_by_no(db, order_no, user_id)
    if order.status != "paid":
        raise BadRequestError("仅已支付订单可申请开票")

    amount = order.actual_revenue_cents
    if amount is None:
        amount = order.amount_cents

    existing = (
        await db.execute(select(SaasInvoice).where(SaasInvoice.order_id == order.id))
    ).scalar_one_or_none()

    if existing is not None and existing.status in ("pending", "issued"):
        raise ConflictError("该订单已申请开票" if existing.status == "pending" else "该订单发票已开具")

    if existing is not None:
        # rejected / voided：复用同一行重新申请
        inv = existing
        inv.status = "pending"
        inv.reject_reason = None
        inv.invoice_no = None
        inv.invoice_file_url = None
        inv.issued_at = None
        inv.issued_by = None
    else:
        inv = SaasInvoice(order_id=order.id, user_id=user_id)
        db.add(inv)

    inv.title_type = payload.title_type
    inv.title = payload.title
    inv.tax_no = payload.tax_no
    inv.invoice_kind = payload.invoice_kind
    inv.reg_address = payload.reg_address
    inv.reg_phone = payload.reg_phone
    inv.bank_name = payload.bank_name
    inv.bank_account = payload.bank_account
    inv.email = payload.email
    inv.amount_cents = int(amount)

    await db.commit()
    await db.refresh(inv)
    await _notify_finance_sms(db, kind="invoice", order_no=order_no)
    return inv


async def list_user_invoices(db: AsyncSession, user_id: str) -> list[SaasInvoice]:
    """本人全部发票，按申请时间倒序。"""
    r = await db.execute(
        select(SaasInvoice)
        .where(SaasInvoice.user_id == user_id)
        .order_by(SaasInvoice.created_at.desc())
    )
    return list(r.scalars().all())


# ---- 内部：把"网关返回的成功结果"应用到订单 ----


async def _apply_gateway_paid(
    db: AsyncSession,
    order: SaasOrder,
    gateway_data: dict[str, Any],
    *,
    source: str,  # 'callback' | 'query'
) -> bool:
    """把通联返回的支付结果同步到本地订单 + 激活订阅。

    - 仅当 pending + trxstatus='0000' + 金额一致时才推进
    - 幂等（paid/refunded 直接 return True）
    - **不 commit**，调用方决定何时 commit
    返回 True 表示订单已是 paid（或本次被推进到 paid）
    """
    if order.status in ("paid", "refunded"):
        return True
    if order.status != "pending":
        return False

    trxstatus = str(gateway_data.get("trxstatus", ""))
    trxamt = gateway_data.get("trxamt")

    # 金额校验
    try:
        if trxamt is not None and int(trxamt) != int(order.amount_cents):
            logger.error(
                "[ALLINPAY-%s] amount mismatch reqsn=%s expected=%s got=%s",
                source.upper(), order.order_no, order.amount_cents, trxamt,
            )
            return False
    except (TypeError, ValueError):
        return False

    if trxstatus != "0000":
        logger.info(
            "[ALLINPAY-%s] non-success trxstatus=%s reqsn=%s",
            source.upper(), trxstatus, order.order_no,
        )
        return False

    order.status = "paid"
    order.paid_at = utcnow()
    order.actual_revenue_cents = int(trxamt) if trxamt else order.amount_cents
    order.gateway_trxid = gateway_data.get("trxid") or order.gateway_trxid
    raw = dict(order.gateway_raw or {})
    raw[source] = gateway_data
    order.gateway_raw = raw

    if order.order_type == "value_added" and order.addon_slug:
        # 增量包订单：支付成功发放对应加包额度到永久池
        await saas_subscription.apply_addon_credit(
            db, user_id=order.user_id, addon_slug=order.addon_slug,
            quantity=int(order.addon_quantity or 1),
        )
    elif order.plan_slug:
        plan_r = await db.execute(select(SaasPlan).where(SaasPlan.slug == order.plan_slug))
        plan = plan_r.scalar_one_or_none()
        if plan is not None:
            await saas_subscription.activate_subscription(
                db, user_id=order.user_id, target_plan=plan,
                selected_period=order.subscription_period or "month",
                source_order_id=order.id,
            )

    # 邀请有礼·二阶：被邀请人首次真实充值成功 → 发二阶奖励给邀请人（幂等；失败不阻塞支付）
    try:
        from app.services import referral_service
        await referral_service.grant_tier2_on_recharge(db, order.user_id)
    except Exception:
        logger.warning("[REFERRAL] tier2 grant failed order=%s", order.order_no, exc_info=True)

    logger.info(
        "[ALLINPAY-%s] order paid reqsn=%s plan=%s",
        source.upper(), order.order_no, order.plan_slug,
    )
    return True


# ---- 回调 ----

# 回调里"商户订单号"可能的字段名（不同产品线命名不一：统一支付=reqsn，交易结果通知=cusorderid）
_CALLBACK_ORDER_KEYS = ("reqsn", "cusorderid", "cusorderno", "out_trade_no")


def _extract_callback_order_no(params: dict[str, Any]) -> str | None:
    """从回调参数里取商户订单号，兼容多种字段命名。"""
    for k in _CALLBACK_ORDER_KEYS:
        v = params.get(k)
        if v:
            return str(v)
    return None


def _mask_callback(params: dict[str, Any]) -> dict[str, Any]:
    """脱敏回调参数中的 sign 值用于日志（保留前 8 位便于排查）。"""
    m = dict(params)
    s = m.get("sign")
    if isinstance(s, str) and len(s) > 12:
        m["sign"] = s[:8] + "...(masked)"
    return m


async def handle_allinpay_callback(
    db: AsyncSession, params: dict[str, Any]
) -> tuple[bool, str]:
    """处理通联异步回调；返回 (是否成功, 应回写给通联的纯文本)。

    通联约定（doc/2331 交易结果通知）：正确处理须返回纯文本 **success**（小写，区分大小写），
    否则按 15s/15s/5m/10m/15m/20m/25m/30m 共 8 次重发。

    安全与兜底：
    - 正常路径：用通联公钥验签（signtype 优先取回调自带）→ 通过则按回调数据推进订单；
    - 兜底路径：验签失败（如 ALLINPAY_PUBLIC_KEY / SIGN_TYPE 配置错误）时**不信任回调内容**，
      改用订单号主动调用查单接口（我方私钥签名、结果可信），以查单真实结果推进订单，
      避免因公钥配错导致支付永远无法闭环。
    """
    masked = _mask_callback(params)
    sign = params.get("sign", "")
    # 验签算法（signtype）优先取回调自带，回退配置项
    sign_type = str(params.get("signtype") or settings.ALLINPAY_SIGN_TYPE)
    verify_params = {k: v for k, v in params.items() if k != "sign"}
    sign_ok = bool(sign) and verify_sign(
        verify_params, sign, settings.ALLINPAY_PUBLIC_KEY, sign_type=sign_type
    )

    order_no = _extract_callback_order_no(params)
    logger.info(
        "[ALLINPAY-CALLBACK] recv | order_no=%s sign_ok=%s signtype=%s "
        "trxstatus=%s trxamt=%s trxid=%s chnltrxid=%s params=%s",
        order_no, sign_ok, sign_type,
        params.get("trxstatus"), params.get("trxamt"),
        params.get("trxid"), params.get("chnltrxid"), masked,
    )

    if not order_no:
        logger.warning(
            "[ALLINPAY-CALLBACK] 缺商户订单号（reqsn/cusorderid 均为空），无法处理 | params=%s",
            masked,
        )
        return False, "FAIL"

    order = (
        await db.execute(select(SaasOrder).where(SaasOrder.order_no == order_no))
    ).scalar_one_or_none()
    if order is None:
        logger.warning("[ALLINPAY-CALLBACK] 订单不存在 order_no=%s", order_no)
        return False, "FAIL"

    # 正常路径：验签通过，直接按回调数据推进
    if sign_ok:
        await _apply_gateway_paid(db, order, params, source="callback")
        await db.commit()
        logger.info(
            "[ALLINPAY-CALLBACK] 验签通过已处理 order_no=%s order_status=%s",
            order_no, order.status,
        )
        return True, "success"

    # 兜底路径：验签失败 → 主动查单，以查单真实结果为准
    logger.warning(
        "[ALLINPAY-CALLBACK] 验签失败，启用查单兜底 order_no=%s signtype=%s "
        "（请核对 ALLINPAY_PUBLIC_KEY / ALLINPAY_SIGN_TYPE 配置是否正确）",
        order_no, sign_type,
    )
    try:
        query_reqsn = order.gateway_reqsn or order_no
        data = await allinpay_client.query_order(order_no=query_reqsn)
        logger.info(
            "[ALLINPAY-CALLBACK] 兜底查单返回 order_no=%s trxstatus=%s trxamt=%s",
            order_no, data.get("trxstatus"), data.get("trxamt"),
        )
        await _apply_gateway_paid(db, order, data, source="callback_query")
        await db.commit()
        logger.info(
            "[ALLINPAY-CALLBACK] 兜底查单已处理 order_no=%s order_status=%s",
            order_no, order.status,
        )
        return True, "success"
    except Exception:
        logger.exception("[ALLINPAY-CALLBACK] 兜底查单失败 order_no=%s", order_no)
        await db.rollback()
        return False, "FAIL"


# ---- 定时任务：超时清理 ----


async def expire_pending_orders(db: AsyncSession) -> int:
    """把 pending 且超时的订单置为 cancelled。"""
    now = utcnow()
    r = await db.execute(
        select(SaasOrder).where(
            SaasOrder.status == "pending",
            SaasOrder.pay_channel == "allinpay",  # 只清通联扫码单；对公待核销单不自动取消
            SaasOrder.expires_at.isnot(None),
            SaasOrder.expires_at <= now,
        )
    )
    items = list(r.scalars().all())
    for o in items:
        o.status = "cancelled"
    if items:
        await db.flush()
        logger.info("expire_pending_orders: cancelled %d orders", len(items))
    return len(items)
