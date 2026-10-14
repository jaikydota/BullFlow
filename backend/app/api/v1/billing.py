"""C 端订阅 / 计费 API。

- GET  /api/v1/billing/plans                公开，价格表
- GET  /api/v1/billing/plans/{slug}/quote   登录，升降级预计算
- POST /api/v1/billing/orders               登录，下单（调通联拿二维码）
- GET  /api/v1/billing/orders/{order_no}    登录，查订单状态（前端轮询）
- POST /api/v1/billing/orders/{order_no}/cancel  登录，取消 pending 订单
- GET  /api/v1/billing/orders               登录，我的订单分页
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.core.time import to_utc_iso
from app.models.saas import SaasAddon, SaasInvoice, SaasOrder, SaasPlan
from app.models.user import User
from app.schemas.billing import (
    AddonOrderCreatePayload,
    AddonOut,
    InvoiceApplyPayload,
    InvoiceOut,
    OrderCreatePayload,
    OrderCreateResult,
    OrderOut,
    PlanOut,
    QuoteOut,
    TransferConfigOut,
    TransferSubmitPayload,
)
from app.schemas.common import PaginatedData, success
from app.services import saas_billing, saas_subscription

router = APIRouter(prefix="/billing", tags=["订阅 / 计费"])


def _plan_to_dict(p: SaasPlan) -> dict:
    return PlanOut(
        id=str(p.id),
        slug=p.slug,
        name=p.name,
        monthly_price_cents=p.monthly_price_cents,
        quarterly_price_cents=(
            saas_subscription.period_price_cents(p, "quarter") if p.quarterly_enabled else None
        ),
        yearly_price_cents=(
            saas_subscription.period_price_cents(p, "year") if p.yearly_enabled else None
        ),
        status=p.status,
        tier=p.tier,
        points_quota=p.points_quota,
        storage_gb=p.storage_gb,
        domestic_accounts=p.domestic_accounts,
        overseas_accounts=p.overseas_accounts,
        features=list(p.features or []),
    ).model_dump()


def _addon_to_dict(a: SaasAddon) -> dict:
    return AddonOut(
        id=str(a.id),
        slug=a.slug,
        name=a.name,
        addon_type=a.addon_type,
        unit_label=a.unit_label,
        price_cents=a.price_cents,
        quota_amount=int(a.points_quota or 0),
        sort_order=int(a.sort_order or 0),
    ).model_dump()


def _order_to_dict(o: SaasOrder) -> dict:
    return OrderOut(
        order_no=o.order_no,
        plan_slug=o.plan_slug,
        addon_slug=o.addon_slug,
        order_type=o.order_type,
        amount_cents=o.amount_cents,
        pay_method=o.pay_method,
        pay_channel=o.pay_channel,
        pay_type_code=o.pay_type_code,
        status=o.status,
        qrcode_url=o.qrcode_url,
        voucher_url=o.voucher_url,
        remark=o.remark,
        description=o.description,
        expires_at=o.expires_at,
        paid_at=o.paid_at,
        created_at=o.created_at,
    ).model_dump(mode="json")


def _invoice_to_dict(inv: SaasInvoice, order_no: str) -> dict:
    return InvoiceOut(
        id=str(inv.id),
        order_no=order_no,
        status=inv.status,
        title_type=inv.title_type,
        title=inv.title,
        tax_no=inv.tax_no,
        invoice_kind=inv.invoice_kind,
        reg_address=inv.reg_address,
        reg_phone=inv.reg_phone,
        bank_name=inv.bank_name,
        bank_account=inv.bank_account,
        email=inv.email,
        amount_cents=inv.amount_cents,
        invoice_no=inv.invoice_no,
        invoice_file_url=inv.invoice_file_url,
        issued_at=inv.issued_at,
        reject_reason=inv.reject_reason,
        created_at=inv.created_at,
    ).model_dump(mode="json")


@router.get("/plans")
async def list_plans_api(db: AsyncSession = Depends(get_db)):
    """公开：价格表，按价格升序。"""
    r = await db.execute(
        select(SaasPlan)
        .where(SaasPlan.status == "active")
        .order_by(SaasPlan.tier.asc(), SaasPlan.monthly_price_cents.asc())
    )
    return success(data=[_plan_to_dict(p) for p in r.scalars().all()])


@router.get("/addons")
async def list_addons_api(db: AsyncSession = Depends(get_db)):
    """公开：增量包（加包）列表，按类型 + 价格排序。"""
    r = await db.execute(
        select(SaasAddon)
        .where(SaasAddon.status == "active")
        .order_by(SaasAddon.sort_order.asc(), SaasAddon.price_cents.asc())
    )
    return success(data=[_addon_to_dict(a) for a in r.scalars().all()])


@router.get("/plans/{slug}/quote")
async def quote_api(
    slug: str,
    period: Annotated[str, Query(pattern=r"^(month|quarter|year)$")] = "month",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    quote = await saas_subscription.compute_quote(db, current_user.id, slug, period)
    return success(data=QuoteOut(**quote).model_dump())


@router.post("/orders")
async def create_order_api(
    body: OrderCreatePayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await saas_billing.create_order(
        db, user=current_user, plan_slug=body.plan_slug,
        billing_period=body.billing_period, pay_method=body.pay_method,
    )
    return success(data=OrderCreateResult(**result).model_dump(mode="json"))


@router.post("/addon-orders")
async def create_addon_order_api(
    body: AddonOrderCreatePayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await saas_billing.create_addon_order(
        db, user=current_user, addon_slug=body.addon_slug,
        quantity=body.quantity, pay_method=body.pay_method,
    )
    return success(data=OrderCreateResult(**result).model_dump(mode="json"))


@router.get("/orders/{order_no}")
async def get_order_api(
    order_no: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 查本地状态时主动同步通联远端，开发环境无 webhook 也能闭环
    order = await saas_billing.get_and_sync_order(db, order_no, current_user.id)
    return success(data=_order_to_dict(order))


@router.post("/orders/{order_no}/cancel")
async def cancel_order_api(
    order_no: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    order = await saas_billing.cancel_order(db, order_no, current_user.id)
    return success(data=_order_to_dict(order))


@router.get("/transfer-config")
async def get_transfer_config_api(
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """对公转账收款账户信息（已登录用户可见）。读 platform_settings.transfer_settings。"""
    from app.models.admin_platform import PlatformSetting

    r = await db.execute(
        select(PlatformSetting.value).where(PlatformSetting.key == "transfer_settings")
    )
    cfg = r.scalar_one_or_none()
    cfg = cfg if isinstance(cfg, dict) else {}
    return success(
        data=TransferConfigOut(
            enabled=bool(cfg.get("enabled", False)),
            company_name=str(cfg.get("company_name", "")),
            account_name=str(cfg.get("account_name", "")),
            account_number=str(cfg.get("account_number", "")),
            bank_name=str(cfg.get("bank_name", "")),
            bank_branch=str(cfg.get("bank_branch", "")),
            remark_tip=str(cfg.get("remark_tip", "")),
        ).model_dump()
    )


@router.post("/orders/{order_no}/submit-transfer")
async def submit_transfer_api(
    order_no: str,
    body: TransferSubmitPayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """用户「我已转账」提交核销（凭证可选），订单转 reviewing 待财务核销。"""
    order = await saas_billing.submit_transfer(
        db, order_no, current_user.id,
        voucher_url=body.voucher_url, remark=body.remark,
    )
    return success(data=_order_to_dict(order))


@router.get("/orders")
async def list_orders_api(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    items, total = await saas_billing.list_user_orders(
        db, current_user.id, page=page, page_size=page_size
    )
    return success(
        data=PaginatedData.create(
            items=[_order_to_dict(o) for o in items],
            total=total, page=page, page_size=page_size,
        ).model_dump()
    )


# ---- 发票 ----


@router.post("/orders/{order_no}/invoice")
async def apply_invoice_api(
    order_no: str,
    body: InvoiceApplyPayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """对已支付订单申请开票（待财务开具）。被驳回后可改信息重新申请。"""
    inv = await saas_billing.apply_invoice(db, order_no, current_user.id, body)
    return success(data=_invoice_to_dict(inv, order_no))


@router.get("/invoices")
async def list_invoices_api(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """我的发票列表（含订单号）。"""
    invoices = await saas_billing.list_user_invoices(db, current_user.id)
    # 一并查订单号映射，避免 N+1
    order_ids = list({inv.order_id for inv in invoices})
    order_no_map: dict[str, str] = {}
    if order_ids:
        r = await db.execute(
            select(SaasOrder.id, SaasOrder.order_no).where(SaasOrder.id.in_(order_ids))
        )
        order_no_map = {oid: ono for oid, ono in r.all()}
    return success(
        data=[_invoice_to_dict(inv, order_no_map.get(inv.order_id, "")) for inv in invoices]
    )


# ---- 计费明细（积分流水） ----

@router.get("/credit-transactions")
async def list_credit_transactions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    biz_type: str | None = Query(None, description="按业务类型过滤：chat / article / image / video / distribution / grant_addon ..."),
    direction: str | None = Query(None, pattern=r"^(debit|credit)$"),
):
    """我的积分流水。按时间倒序，可按业务类型 / 方向筛选。"""
    from app.services import credit_ledger

    rows, total = await credit_ledger.list_user_transactions(
        db, current_user.id,
        page=page, page_size=page_size,
        biz_type=biz_type, direction=direction,  # type: ignore[arg-type]
    )

    items = [
        {
            "id": str(r.id),
            "direction": r.direction,
            "amount": int(r.amount),
            "source": r.source,
            "biz_type": r.biz_type,
            "biz_ref_type": r.biz_ref_type,
            "biz_ref_id": r.biz_ref_id,
            "model_id": r.model_id,
            "unit_price": r.unit_price,
            "units": r.units,
            "balance_after_sub": int(r.balance_after_sub),
            "balance_after_addon": int(r.balance_after_addon),
            "remark": r.remark,
            "created_at": to_utc_iso(r.created_at),
        }
        for r in rows
    ]
    return success(
        data=PaginatedData.create(
            items=items, total=total, page=page, page_size=page_size,
        ).model_dump()
    )
