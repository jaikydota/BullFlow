from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.defaults.platform_settings_defaults import SETTINGS_DEFAULTS
from app.admin.services.audit_logger import append_audit_log

from app.models.admin_platform import AdminAuditLog, PlatformSetting


async def merge_settings_defaults(db: AsyncSession) -> None:
    """Insert missing keys with defaults."""
    existing = (
        await db.execute(select(PlatformSetting.key).where(PlatformSetting.key.in_(list(SETTINGS_DEFAULTS.keys()))))
    ).all()
    exist_keys = {r[0] for r in existing}
    for k, v in SETTINGS_DEFAULTS.items():
        if k not in exist_keys:
            db.add(PlatformSetting(key=k, value=v))  # type: ignore[arg-type]


async def get_all_settings(db: AsyncSession) -> dict:
    await merge_settings_defaults(db)
    await db.flush()
    rows = (await db.execute(select(PlatformSetting))).scalars().all()
    out: dict = dict(SETTINGS_DEFAULTS)
    for r in rows:
        out[r.key] = r.value
    return out


async def update_settings_partial(db: AsyncSession, patch: dict, operator_id: str) -> dict:
    if not isinstance(patch, dict):
        patch = {}

    for key, val in patch.items():
        row = (
            await db.execute(select(PlatformSetting).where(PlatformSetting.key == key))
        ).scalar_one_or_none()
        if row is None:
            row = PlatformSetting(key=key, value=val)
            db.add(row)
        else:
            row.value = val

    await append_audit_log(
        db,
        operator_id=operator_id,
        action="platform_settings.patch",
        resource_type="platform_settings",
        resource_id=None,
        detail={"keys": list(patch.keys())[:50]},
    )
    await db.flush()
    return await get_all_settings(db)


async def list_audit_logs(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
    search: str | None,
) -> tuple[list[dict], int]:
    q = select(AdminAuditLog)
    cq = select(func.count()).select_from(AdminAuditLog)

    if search:
        like = f"%{search}%"
        f = AdminAuditLog.action.like(like) | func.coalesce(
            AdminAuditLog.resource_type, ""
        ).like(like)
        q = q.where(f)
        cq = cq.where(f)

    total = int((await db.execute(cq)).scalar() or 0)
    q = q.order_by(AdminAuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = list((await db.execute(q)).scalars().all())

    items = []
    for r in rows:
        items.append(
            {
                "id": str(r.id),
                "operatorUserId": str(r.operator_id) if r.operator_id else None,
                "action": r.action,
                "resourceType": r.resource_type,
                "resourceId": r.resource_id,
                "detail": r.detail,
                "createdAt": r.created_at.isoformat(timespec="seconds") if r.created_at else "",
            }
        )
    return items, total
