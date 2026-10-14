from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user, get_current_finance_user
from app.admin.schemas.common import PaginatedData, success
from app.admin.schemas.saas_admin import (
    AdminAddonGrant,
    AdminOrderCreate,
    AdminOrderMarkPaid,
    AdminOrderReject,
    AdminSubscriptionGrant,
)
from app.admin.services import saas_ops

from app.models.user import User

router = APIRouter(prefix="/orders", tags=["订单管理"])


@router.get("")
async def list_orders_api(
    _a: User = Depends(get_current_finance_user),
    db: AsyncSession = Depends(get_db),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: Annotated[str | None, Query()] = None,
    order_type: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
):
    items, total = await saas_ops.list_orders(
        db,
        page=page,
        page_size=page_size,
        search=search,
        order_type=order_type,
        status=status,
    )
    return success(data=PaginatedData.create(items=items, total=total, page=page, page_size=page_size).model_dump())


@router.post("")
async def create_order_api(
    body: AdminOrderCreate,
    admin: User = Depends(get_current_finance_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data={"order": await saas_ops.create_order(db, body, operator_id=str(admin.id))})


@router.post("/grant")
async def grant_subscription_api(
    body: AdminSubscriptionGrant,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """内部开通：为某用户注入套餐（建已支付订单 + 激活订阅）。"""
    return success(
        data={"order": await saas_ops.grant_subscription(db, body, operator_id=str(admin.id))}
    )


@router.post("/grant-addon")
async def grant_addon_api(
    body: AdminAddonGrant,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """赠送增量包：为某用户发放增量包额度（建一条 amount=0 的已支付订单做记录）。"""
    return success(
        data={"order": await saas_ops.grant_addon(db, body, operator_id=str(admin.id))}
    )


@router.post("/{order_id}/mark-paid")
async def mark_paid_api(
    order_id: str,
    body: AdminOrderMarkPaid,
    admin: User = Depends(get_current_finance_user),
    db: AsyncSession = Depends(get_db),
):
    return success(
        data={"order": await saas_ops.mark_order_paid(db, order_id, body, operator_id=str(admin.id))}
    )


@router.post("/{order_id}/reject-transfer")
async def reject_transfer_api(
    order_id: str,
    body: AdminOrderReject,
    admin: User = Depends(get_current_finance_user),
    db: AsyncSession = Depends(get_db),
):
    """驳回对公转账核销：退回「待提交」并通知用户重新提交。"""
    return success(
        data={"order": await saas_ops.reject_transfer_order(db, order_id, body.reason, operator_id=str(admin.id))}
    )


@router.post("/{order_id}/cancel")
async def cancel_order_api(
    order_id: str,
    admin: User = Depends(get_current_finance_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data={"order": await saas_ops.cancel_order(db, order_id, operator_id=str(admin.id))})


@router.post("/{order_id}/refund")
async def refund_order_api(
    order_id: str,
    admin: User = Depends(get_current_finance_user),
    db: AsyncSession = Depends(get_db),
    remark: Annotated[str | None, Query()] = None,
):
    return success(
        data={"order": await saas_ops.refund_order(db, order_id, remark, operator_id=str(admin.id))}
    )
