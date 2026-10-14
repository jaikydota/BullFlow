from __future__ import annotations

import logging
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.admin.schemas.traffic_secret import (
    TrafficSecretCreate,
    TrafficSecretOut,
    TrafficSecretUpdate,
)
from app.admin.services.audit_logger import append_audit_log

from app.core.config import settings as backend_settings
from app.models.admin_platform import TrafficSecretItem
from app.services.minio_service import url_to_path

logger = logging.getLogger(__name__)


def _is_minio_url(url: str | None) -> bool:
    """判定一个 URL 是否指向我们自己的 MinIO（避免误删运营手贴的外网图片）。"""
    if not url:
        return False
    prefix = f"{backend_settings.MINIO_PUBLIC_URL.rstrip('/')}/{backend_settings.MINIO_BUCKET_NAME}/"
    return url.startswith(prefix)


async def _safe_delete_minio(url: str | None) -> None:
    """best-effort 删除 MinIO 对象，失败仅日志不抛（不影响主业务）。"""
    if not _is_minio_url(url):
        return
    try:
        from app.services.minio_service import MinIOService

        object_name = url_to_path(url)
        if not object_name:
            return
        await MinIOService().delete_file(object_name)
        logger.info("MinIO orphan deleted: %s", object_name)
    except Exception as e:  # noqa: BLE001
        logger.warning("MinIO delete failed for %s: %s", url, e)


def _row_to_out(row: TrafficSecretItem) -> dict:
    rating_val: float | None
    if row.rating is None:
        rating_val = None
    elif isinstance(row.rating, Decimal):
        rating_val = float(row.rating)
    else:
        rating_val = float(row.rating)
    return TrafficSecretOut(
        id=str(row.id),
        title=row.title,
        icon=row.icon,
        iconUrl=row.icon_url,
        description=row.description,
        tags=list(row.tags or []),
        rating=rating_val,
        category=row.category,
        source=row.source,
        priceStatus=row.price_status,
        contentMarkdown=row.content_markdown,
        url=row.url,
        sortOrder=row.sort_order,
        isEnabled=row.is_enabled,
        createdAt=row.created_at.isoformat(timespec="seconds") if row.created_at else None,
        updatedAt=row.updated_at.isoformat(timespec="seconds") if row.updated_at else None,
    ).model_dump()


async def list_items(db: AsyncSession) -> list[dict]:
    stmt = select(TrafficSecretItem).order_by(
        TrafficSecretItem.sort_order.asc(),
        TrafficSecretItem.created_at.desc(),
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_row_to_out(r) for r in rows]


async def create_item(
    db: AsyncSession,
    body: TrafficSecretCreate,
    *,
    operator_id: str | None = None,
) -> dict:
    row = TrafficSecretItem(
        title=body.title,
        icon=body.icon,
        icon_url=body.icon_url,
        description=body.description,
        tags=list(body.tags or []),
        rating=body.rating,
        category=body.category,
        source=body.source,
        price_status=body.price_status,
        content_markdown=body.content_markdown,
        url=body.url,
        sort_order=body.sort_order,
        is_enabled=body.is_enabled,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="traffic_secret.create",
            resource_type="traffic_secret",
            resource_id=str(row.id),
            detail={"title": row.title},
        )
    return _row_to_out(row)


async def update_item(
    db: AsyncSession,
    item_id: str,
    body: TrafficSecretUpdate,
    *,
    operator_id: str | None = None,
) -> dict:
    row = (
        await db.execute(select(TrafficSecretItem).where(TrafficSecretItem.id == item_id))
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("流量密码不存在")

    payload = body.model_dump(exclude_unset=True)
    field_map = {
        "title": "title",
        "icon": "icon",
        "icon_url": "icon_url",
        "description": "description",
        "tags": "tags",
        "rating": "rating",
        "category": "category",
        "source": "source",
        "price_status": "price_status",
        "content_markdown": "content_markdown",
        "url": "url",
        "sort_order": "sort_order",
        "is_enabled": "is_enabled",
    }
    # 记录旧 icon_url 以便对比清理（避免上传新图后旧 minio 文件成为孤儿）
    old_icon_url = row.icon_url
    for k, attr in field_map.items():
        if k in payload:
            setattr(row, attr, payload[k])

    await db.flush()
    await db.refresh(row)

    # icon_url 变化时，best-effort 删除旧的 minio 对象（外网 URL 不动）
    if "icon_url" in payload and old_icon_url and old_icon_url != row.icon_url:
        await _safe_delete_minio(old_icon_url)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="traffic_secret.update",
            resource_type="traffic_secret",
            resource_id=str(row.id),
            detail={"keys": list(payload.keys())},
        )
    return _row_to_out(row)


async def toggle_item(
    db: AsyncSession,
    item_id: str,
    enabled: bool,
    *,
    operator_id: str | None = None,
) -> dict:
    row = (
        await db.execute(select(TrafficSecretItem).where(TrafficSecretItem.id == item_id))
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("流量密码不存在")

    row.is_enabled = enabled
    await db.flush()
    await db.refresh(row)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="traffic_secret.toggle",
            resource_type="traffic_secret",
            resource_id=str(row.id),
            detail={"enabled": enabled},
        )
    return _row_to_out(row)


async def delete_item(
    db: AsyncSession,
    item_id: str,
    *,
    operator_id: str | None = None,
) -> None:
    row = (
        await db.execute(select(TrafficSecretItem).where(TrafficSecretItem.id == item_id))
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("流量密码不存在")
    title = row.title
    orphan_icon_url = row.icon_url
    await db.delete(row)
    await db.flush()
    # 删 row 后清掉 minio 对象（外网 URL 不动）
    await _safe_delete_minio(orphan_icon_url)
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="traffic_secret.delete",
            resource_type="traffic_secret",
            resource_id=item_id,
            detail={"title": title},
        )
