"""积分流水（CreditTransaction）写入与查询。

调用约定：
- 写入函数（record_debit / record_credit）不 commit，由调用方决定（通常与 consume_points 同事务）
- 查询函数（list_user_transactions）只读，分页 + 可选业务类型筛选
"""
from __future__ import annotations

import logging
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.credit_transaction import CreditTransaction

logger = logging.getLogger(__name__)


SourceType = Literal["subscription", "addon", "mixed"]
DirectionType = Literal["debit", "credit"]


async def record_debit(
    db: AsyncSession,
    *,
    user_id: str,
    amount: int,
    source: SourceType,
    biz_type: str,
    balance_after_sub: int,
    balance_after_addon: int,
    biz_ref_type: str | None = None,
    biz_ref_id: str | None = None,
    model_id: str | None = None,
    unit_price: float | None = None,
    units: float | None = None,
    remark: str | None = None,
) -> CreditTransaction:
    """记录一次扣分。调用方应在 consume_points 成功后、同一事务内调用本函数。"""
    tx = CreditTransaction(
        user_id=user_id,
        direction="debit",
        amount=max(0, int(amount)),
        source=source,
        biz_type=biz_type,
        biz_ref_type=biz_ref_type,
        biz_ref_id=str(biz_ref_id) if biz_ref_id else None,
        model_id=model_id,
        unit_price=unit_price,
        units=units,
        balance_after_sub=int(balance_after_sub),
        balance_after_addon=int(balance_after_addon),
        remark=remark,
    )
    db.add(tx)
    await db.flush()
    return tx


async def record_credit(
    db: AsyncSession,
    *,
    user_id: str,
    amount: int,
    source: SourceType,
    biz_type: str,
    balance_after_sub: int,
    balance_after_addon: int,
    biz_ref_type: str | None = None,
    biz_ref_id: str | None = None,
    remark: str | None = None,
) -> CreditTransaction:
    """记录一次加分（注册赠送 / 订单成单 / 管理员调整）。"""
    tx = CreditTransaction(
        user_id=user_id,
        direction="credit",
        amount=max(0, int(amount)),
        source=source,
        biz_type=biz_type,
        biz_ref_type=biz_ref_type,
        biz_ref_id=str(biz_ref_id) if biz_ref_id else None,
        balance_after_sub=int(balance_after_sub),
        balance_after_addon=int(balance_after_addon),
        remark=remark,
    )
    db.add(tx)
    await db.flush()
    return tx


async def list_user_transactions(
    db: AsyncSession,
    user_id: str,
    *,
    page: int = 1,
    page_size: int = 20,
    biz_type: str | None = None,
    direction: DirectionType | None = None,
) -> tuple[list[CreditTransaction], int]:
    """分页查询用户流水（按时间倒序）。"""
    base = select(CreditTransaction).where(CreditTransaction.user_id == user_id)
    if biz_type:
        base = base.where(CreditTransaction.biz_type == biz_type)
    if direction:
        base = base.where(CreditTransaction.direction == direction)

    total = (
        await db.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()

    q = (
        base.order_by(CreditTransaction.created_at.desc())
        .offset(max(0, (page - 1) * page_size))
        .limit(page_size)
    )
    rows = list((await db.execute(q)).scalars().all())
    return rows, int(total or 0)
