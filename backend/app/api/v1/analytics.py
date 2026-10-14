"""埋点上报接口（公开，支持匿名）。

设计：
- 不用 `get_current_user`（它对未登录会抛异常）；改为手动、可选地从 Authorization
  解析出 user_id，匿名放行。
- **埋点失败绝不影响业务**：任何异常都吞掉并返回 accepted=0，前端 fire-and-forget。
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, Request
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_db
from app.schemas.analytics import TrackBatchIn, TrackEventIn
from app.schemas.common import success
from app.services import analytics_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["埋点"])


def _optional_user_id(authorization: str | None) -> str | None:
    """从 Bearer token 尽力解析 user_id；无 / 无效则返回 None（匿名）。"""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        payload = jwt.decode(
            authorization[7:], settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        return payload.get("sub")
    except JWTError:
        return None


def _client_ip(request: Request) -> str | None:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()[:64]
    return request.client.host if request.client else None


async def _ingest(
    db: AsyncSession, items: list[TrackEventIn], request: Request, authorization: str | None
) -> int:
    uid = _optional_user_id(authorization)
    n = await analytics_service.record_events(
        db,
        items,
        user_id=uid,
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    return n


@router.post("/track")
async def track_event(
    body: TrackEventIn,
    request: Request,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """单条事件上报。"""
    try:
        n = await _ingest(db, [body], request, authorization)
        return success(data={"accepted": n})
    except Exception:
        await db.rollback()
        logger.warning("[analytics] track 落库失败（已忽略，不影响业务）", exc_info=True)
        return success(data={"accepted": 0})


@router.post("/track/batch")
async def track_batch(
    body: TrackBatchIn,
    request: Request,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """批量事件上报（前端队列 flush）。"""
    try:
        n = await _ingest(db, body.events, request, authorization)
        return success(data={"accepted": n})
    except Exception:
        await db.rollback()
        logger.warning("[analytics] track/batch 落库失败（已忽略，不影响业务）", exc_info=True)
        return success(data={"accepted": 0})
