from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.schemas.common import success
from app.services import traffic_secrets_service

router = APIRouter(prefix="/traffic-secrets", tags=["流量密码"])


def _to_dict(row) -> dict:
    rating_val: float | None
    if row.rating is None:
        rating_val = None
    elif isinstance(row.rating, Decimal):
        rating_val = float(row.rating)
    else:
        rating_val = float(row.rating)
    return {
        "id": str(row.id),
        "title": row.title,
        "icon": row.icon,
        "iconUrl": row.icon_url,
        "description": row.description,
        "tags": list(row.tags or []),
        "rating": rating_val,
        "category": row.category,
        "source": row.source,
        "priceStatus": row.price_status,
        "contentMarkdown": row.content_markdown,
        "url": row.url,
        "sortOrder": row.sort_order,
    }


@router.get("")
async def list_traffic_secrets(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """C 端流量密码列表（仅启用项，按 sort_order 升序）。需登录。"""
    rows = await traffic_secrets_service.list_enabled(db)
    return success(data={"items": [_to_dict(r) for r in rows]})
