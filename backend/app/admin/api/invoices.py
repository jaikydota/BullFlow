from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_finance_user
from app.admin.schemas.common import PaginatedData, success
from app.admin.schemas.saas_admin import AdminInvoiceIssue, AdminInvoiceReject
from app.admin.services import invoice_ops

from app.models.user import User

router = APIRouter(prefix="/invoices", tags=["发票管理"])


@router.get("")
async def list_invoices_api(
    _a: User = Depends(get_current_finance_user),
    db: AsyncSession = Depends(get_db),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status: Annotated[str | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
):
    items, total = await invoice_ops.list_invoices(
        db, status=status, search=search, page=page, page_size=page_size
    )
    return success(
        data=PaginatedData.create(
            items=items, total=total, page=page, page_size=page_size
        ).model_dump()
    )


@router.post("/{invoice_id}/issue")
async def issue_invoice_api(
    invoice_id: str,
    body: AdminInvoiceIssue,
    admin: User = Depends(get_current_finance_user),
    db: AsyncSession = Depends(get_db),
):
    return success(
        data={"invoice": await invoice_ops.issue_invoice(db, invoice_id, body, operator_id=str(admin.id))}
    )


@router.post("/{invoice_id}/reject")
async def reject_invoice_api(
    invoice_id: str,
    body: AdminInvoiceReject,
    admin: User = Depends(get_current_finance_user),
    db: AsyncSession = Depends(get_db),
):
    return success(
        data={"invoice": await invoice_ops.reject_invoice(db, invoice_id, body.reason, operator_id=str(admin.id))}
    )
