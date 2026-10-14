"""发票管理 service（财务后台）。

流程：用户对已支付订单申请开票(pending) → 财务开票(issued，回填发票号 + 上传发票文件)
/ 驳回(rejected)。开票 / 驳回均通知用户。与 saas_ops 同款 flush + get_db 收尾 commit。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.admin.schemas.saas_admin import AdminInvoiceIssue, AdminInvoiceOut
from app.admin.services.audit_logger import append_audit_log

from app.models.saas import SaasInvoice, SaasOrder


def _invoice_to_out(inv: SaasInvoice, order_no: str | None, tenant_name: str | None) -> dict:
    return AdminInvoiceOut(
        id=str(inv.id),
        orderNo=order_no,
        tenantName=tenant_name,
        status=inv.status,
        titleType=inv.title_type,
        title=inv.title,
        taxNo=inv.tax_no,
        invoiceKind=inv.invoice_kind,
        regAddress=inv.reg_address,
        regPhone=inv.reg_phone,
        bankName=inv.bank_name,
        bankAccount=inv.bank_account,
        email=inv.email,
        amount=inv.amount_cents // 100,
        invoiceNo=inv.invoice_no,
        invoiceFileUrl=inv.invoice_file_url,
        issuedAt=inv.issued_at.isoformat(timespec="seconds") if inv.issued_at else None,
        rejectReason=inv.reject_reason,
        createdAt=inv.created_at.isoformat(timespec="seconds") if inv.created_at else None,
    ).model_dump()


async def list_invoices(
    db: AsyncSession,
    *,
    status: str | None = None,
    search: str | None = None,
    page: int,
    page_size: int,
) -> tuple[list[dict], int]:
    """发票申请台账：join 订单拿 order_no / 租户名；按 status 筛、search 搜 order_no/title/tax_no。"""
    base = select(SaasInvoice, SaasOrder.order_no, SaasOrder.tenant_display_name).join(
        SaasOrder, SaasInvoice.order_id == SaasOrder.id
    )
    cq = select(func.count()).select_from(SaasInvoice).join(
        SaasOrder, SaasInvoice.order_id == SaasOrder.id
    )

    if status:
        base = base.where(SaasInvoice.status == status)
        cq = cq.where(SaasInvoice.status == status)
    if search:
        like = f"%{search}%"
        f = or_(
            SaasOrder.order_no.like(like),
            SaasInvoice.title.like(like),
            func.coalesce(SaasInvoice.tax_no, "").like(like),
        )
        base = base.where(f)
        cq = cq.where(f)

    total = int((await db.execute(cq)).scalar() or 0)
    base = (
        base.order_by(SaasInvoice.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(base)).all()
    items = [_invoice_to_out(inv, order_no, tenant) for inv, order_no, tenant in rows]
    return items, total


async def _load_with_order(
    db: AsyncSession, invoice_id: str
) -> tuple[SaasInvoice, str | None, str | None]:
    row = (
        await db.execute(
            select(SaasInvoice, SaasOrder.order_no, SaasOrder.tenant_display_name)
            .join(SaasOrder, SaasInvoice.order_id == SaasOrder.id)
            .where(SaasInvoice.id == invoice_id)
        )
    ).first()
    if row is None:
        raise NotFoundError("发票不存在")
    inv, order_no, tenant = row
    return inv, order_no, tenant


async def issue_invoice(
    db: AsyncSession,
    invoice_id: str,
    body: AdminInvoiceIssue,
    *,
    operator_id: str,
) -> dict:
    """开票：pending / rejected → issued，回填发票号 + 文件 + 开具人/时间，通知用户。

    幂等：已 issued 不重复处理。调用方/外层 commit。
    """
    inv, order_no, tenant = await _load_with_order(db, invoice_id)
    if inv.status not in ("pending", "rejected", "issued"):
        raise ConflictError("已作废的发票不可开具")

    was_issued = inv.status == "issued"  # 已开具→再次提交即「修改更正」（发票号填错 / 换文件）
    inv.status = "issued"
    inv.invoice_no = body.invoice_no
    if body.invoice_file_url is not None:
        inv.invoice_file_url = body.invoice_file_url
    if not was_issued:
        inv.issued_at = datetime.utcnow()
    inv.issued_by = operator_id
    inv.reject_reason = None
    await db.flush()

    # 仅首次开具时通知用户；事后修改更正不重复打扰
    if not was_issued:
        try:
            from app.services.notification_service import create_notification

            await create_notification(
                db,
                user_id=str(inv.user_id),
                type="invoice.issued",
                title="发票已开具",
                message=f"订单 {order_no} 的发票已开具，发票号 {body.invoice_no}，可前往下载。",
                link_url="/account/subscription",
                extra={"order_no": order_no, "invoice_no": body.invoice_no},
            )
        except Exception:  # noqa: BLE001
            pass

        # 用户填了收票邮箱 → 发邮件（失败不阻塞开票）
        if (inv.email or "").strip():
            try:
                from app.admin.services import email_service

                await email_service.send_invoice_issued_email(
                    to_addr=inv.email.strip(),
                    invoice_no=body.invoice_no,
                    order_no=order_no,
                    amount_yuan=int(inv.amount_cents or 0) // 100,
                    title=inv.title or "",
                    file_url=(body.invoice_file_url or inv.invoice_file_url),
                )
            except Exception:  # noqa: BLE001
                import logging

                logging.getLogger(__name__).exception(
                    "[INVOICE] 发票邮件发送失败 invoice_id=%s", invoice_id
                )

    await db.refresh(inv)
    await append_audit_log(
        db,
        operator_id=operator_id,
        action="invoice.issue",
        resource_type="saas_invoice",
        resource_id=str(inv.id),
        detail={"order_no": order_no, "invoice_no": body.invoice_no},
    )
    return _invoice_to_out(inv, order_no, tenant)


async def reject_invoice(
    db: AsyncSession,
    invoice_id: str,
    reason: str,
    *,
    operator_id: str,
) -> dict:
    """驳回：pending → rejected，写驳回原因并通知用户。调用方/外层 commit。"""
    inv, order_no, tenant = await _load_with_order(db, invoice_id)
    if inv.status not in ("pending",):
        raise ConflictError("仅待开发票可驳回")

    inv.status = "rejected"
    inv.reject_reason = reason
    await db.flush()

    try:
        from app.services.notification_service import create_notification

        await create_notification(
            db,
            user_id=str(inv.user_id),
            type="invoice.rejected",
            title="发票申请被驳回",
            message=f"订单 {order_no} 的开票申请被驳回：{reason}。请核对信息后重新申请。",
            link_url="/account/subscription",
            extra={"order_no": order_no, "reason": reason},
        )
    except Exception:  # noqa: BLE001
        pass

    await db.refresh(inv)
    await append_audit_log(
        db,
        operator_id=operator_id,
        action="invoice.reject",
        resource_type="saas_invoice",
        resource_id=str(inv.id),
        detail={"order_no": order_no, "reason": reason},
    )
    return _invoice_to_out(inv, order_no, tenant)
