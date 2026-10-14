"""admin 推送服务：创建广播 → 批量展开为 user notifications；撤回 → 反向删除。"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, NotFoundError
from app.admin.schemas.broadcast import BroadcastCreate, BroadcastOut
from app.admin.services.audit_logger import append_audit_log

from app.models.admin_platform import NotificationBroadcast
from app.models.notification import Notification
from app.models.user import User

logger = logging.getLogger(__name__)


def _row_to_out(
    row: NotificationBroadcast,
    *,
    read_count: int = 0,
    operator_name: str | None = None,
) -> dict:
    return BroadcastOut(
        id=str(row.id),
        title=row.title,
        message=row.message,
        linkUrl=row.link_url,
        type=row.type,
        targetKind=row.target_kind,
        targetUserIds=list(row.target_user_ids or []),
        totalCount=row.total_count or 0,
        readCount=read_count,
        operatorId=str(row.operator_id) if row.operator_id else None,
        operatorName=operator_name,
        revokedAt=row.revoked_at.isoformat(timespec="seconds") if row.revoked_at else None,
        createdAt=row.created_at.isoformat(timespec="seconds") if row.created_at else None,
    ).model_dump()


async def _resolve_target_user_ids(
    db: AsyncSession, body: BroadcastCreate
) -> list[str]:
    """根据 target_kind 解析出最终 user_id 列表。"""
    if body.target_kind == "all":
        rows = (
            await db.execute(
                select(User.id).where(User.status == "active")
            )
        ).all()
        return [str(uid) for (uid,) in rows]

    # users 模式：去重 + 校验存在
    cleaned = [u.strip() for u in (body.target_user_ids or []) if u and u.strip()]
    if not cleaned:
        raise BadRequestError("选定用户模式必须提供至少 1 个 user_id")
    uniq = list(dict.fromkeys(cleaned))
    rows = (
        await db.execute(select(User.id).where(User.id.in_(uniq)))
    ).all()
    found = {str(uid) for (uid,) in rows}
    missing = [u for u in uniq if u not in found]
    if missing:
        raise BadRequestError(f"以下 user_id 不存在：{', '.join(missing[:5])}")
    return uniq


async def create_broadcast(
    db: AsyncSession, body: BroadcastCreate, *, operator_id: str
) -> dict:
    target_ids = await _resolve_target_user_ids(db, body)
    if not target_ids:
        raise BadRequestError("没有可推送的目标用户")

    row = NotificationBroadcast(
        title=body.title.strip(),
        message=(body.message or None),
        link_url=(body.link_url or None),
        type=body.type or "admin.broadcast",
        target_kind=body.target_kind,
        target_user_ids=target_ids if body.target_kind == "users" else None,
        total_count=len(target_ids),
        operator_id=operator_id,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)

    # 展开为 per-user notifications；用 add_all 批量插入
    extra_base: dict[str, Any] = {"broadcast_id": str(row.id)}
    notifications = [
        Notification(
            user_id=uid,
            type=row.type,
            title=row.title,
            message=row.message,
            link_url=row.link_url,
            extra=extra_base,
        )
        for uid in target_ids
    ]
    db.add_all(notifications)
    await db.flush()

    await append_audit_log(
        db,
        operator_id=operator_id,
        action="broadcast.create",
        resource_type="broadcast",
        resource_id=str(row.id),
        detail={"target_count": len(target_ids), "title": row.title[:80]},
    )

    return _row_to_out(row)


async def list_broadcasts(
    db: AsyncSession, *, page: int, page_size: int
) -> tuple[list[dict], int]:
    base = select(NotificationBroadcast)
    total = int(
        (
            await db.execute(
                select(func.count()).select_from(NotificationBroadcast)
            )
        ).scalar()
        or 0
    )
    stmt = (
        base.order_by(NotificationBroadcast.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    if not rows:
        return [], total

    ids = [r.id for r in rows]

    # 一次性聚合查询每个 broadcast 的已读人数
    # MySQL JSON_EXTRACT(extra, '$.broadcast_id') 匹配 broadcast id
    read_count_map: dict[str, int] = {}
    for r in rows:
        bid = str(r.id)
        cnt = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(Notification)
                    .where(
                        func.json_extract(Notification.extra, "$.broadcast_id") == bid,
                        Notification.read_at.is_not(None),
                    )
                )
            ).scalar()
            or 0
        )
        read_count_map[bid] = cnt

    # 批量查 operator 昵称
    operator_ids = list({r.operator_id for r in rows if r.operator_id})
    operator_map: dict[str, str] = {}
    if operator_ids:
        uo = (
            await db.execute(
                select(User.id, User.nickname, User.email).where(
                    User.id.in_(operator_ids)
                )
            )
        ).all()
        for uid, nick, em in uo:
            operator_map[str(uid)] = (nick or em or "").strip() or None  # type: ignore[assignment]

    out = []
    for r in rows:
        bid = str(r.id)
        opname = operator_map.get(str(r.operator_id)) if r.operator_id else None
        out.append(_row_to_out(r, read_count=read_count_map.get(bid, 0), operator_name=opname))
    return out, total


async def revoke_broadcast(
    db: AsyncSession, broadcast_id: str, *, operator_id: str
) -> dict:
    row = (
        await db.execute(
            select(NotificationBroadcast).where(NotificationBroadcast.id == broadcast_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("推送不存在")
    if row.revoked_at is not None:
        raise BadRequestError("该推送已撤回")

    # 删除所有展开的 user notifications
    bid = str(row.id)
    stmt = delete(Notification).where(
        func.json_extract(Notification.extra, "$.broadcast_id") == bid
    )
    result = await db.execute(stmt)
    deleted = int(result.rowcount or 0)

    row.revoked_at = datetime.utcnow()
    await db.flush()
    await db.refresh(row)

    await append_audit_log(
        db,
        operator_id=operator_id,
        action="broadcast.revoke",
        resource_type="broadcast",
        resource_id=str(row.id),
        detail={"deleted_notifications": deleted},
    )

    return _row_to_out(row, read_count=0)
