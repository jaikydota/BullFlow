"""C 端站内通知 service。

所有业务事件通过 `create_notification` 工厂函数写入 notifications 表，
跟主业务事务共用 session；cron / BackgroundTask 内调用需自己新建 session
并 commit（见 CLAUDE.md §5.1 flush vs commit 陷阱）。
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from app.core.time import to_utc_iso, utcnow
from typing import Any

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification

logger = logging.getLogger(__name__)


async def create_notification(
    db: AsyncSession,
    *,
    user_id: str,
    type: str,
    title: str,
    message: str | None = None,
    link_url: str | None = None,
    extra: dict[str, Any] | None = None,
) -> Notification:
    """写一条通知。调用方负责 commit。失败仅记日志不抛（通知不应阻塞主业务）。"""
    try:
        row = Notification(
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            link_url=link_url,
            extra=extra,
        )
        db.add(row)
        await db.flush()
        await db.refresh(row)
        return row
    except Exception as e:  # noqa: BLE001
        logger.warning("create_notification 失败 user_id=%s type=%s: %s", user_id, type, e)
        raise


async def has_recent_notification(
    db: AsyncSession,
    *,
    user_id: str,
    type: str,
    extra_key: str | None = None,
    extra_value: Any = None,
    within_days: int = 7,
) -> bool:
    """检查 within_days 天内是否已存在同 user_id + type (+ extra.key=value) 的通知。

    用于周期扫描事件（订阅即将到期、账号即将过期等）的幂等去重，避免重复打扰用户。
    """
    since = utcnow() - timedelta(days=within_days)
    conds = [
        Notification.user_id == user_id,
        Notification.type == type,
        Notification.created_at >= since,
    ]
    if extra_key is not None:
        # MySQL JSON 提取：JSON_EXTRACT(extra, '$.key') = value
        conds.append(
            func.json_extract(Notification.extra, f"$.{extra_key}") == extra_value
        )
    stmt = select(func.count()).select_from(Notification).where(and_(*conds))
    cnt = int((await db.execute(stmt)).scalar() or 0)
    return cnt > 0


async def list_for_user(
    db: AsyncSession,
    user_id: str,
    *,
    page: int = 1,
    page_size: int = 20,
    type: str | None = None,
    only_unread: bool = False,
) -> tuple[list[Notification], int]:
    conds = [Notification.user_id == user_id]
    if type:
        conds.append(Notification.type == type)
    if only_unread:
        conds.append(Notification.read_at.is_(None))

    base = select(Notification).where(and_(*conds))
    total_stmt = select(func.count()).select_from(Notification).where(and_(*conds))
    total = int((await db.execute(total_stmt)).scalar() or 0)

    stmt = (
        base.order_by(Notification.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return rows, total


async def count_unread(db: AsyncSession, user_id: str) -> int:
    stmt = (
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
    )
    return int((await db.execute(stmt)).scalar() or 0)


async def mark_read(db: AsyncSession, notification_id: str, user_id: str) -> bool:
    """带 user_id 防越权。返回是否真的更新了一行。"""
    stmt = (
        update(Notification)
        .where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
        .values(read_at=utcnow())
    )
    result = await db.execute(stmt)
    return (result.rowcount or 0) > 0


async def mark_all_read(db: AsyncSession, user_id: str) -> int:
    stmt = (
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
        .values(read_at=utcnow())
    )
    result = await db.execute(stmt)
    return int(result.rowcount or 0)


async def delete_notification(
    db: AsyncSession, notification_id: str, user_id: str
) -> bool:
    row = (
        await db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return False
    await db.delete(row)
    return True


def to_dict(row: Notification) -> dict:
    """ORM → 前端 camelCase JSON。"""
    return {
        "id": str(row.id),
        "type": row.type,
        "title": row.title,
        "message": row.message,
        "linkUrl": row.link_url,
        "extra": row.extra,
        "readAt": to_utc_iso(row.read_at),
        "createdAt": to_utc_iso(row.created_at),
    }
