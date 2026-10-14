"""Publish status management for generated content: draft -> ready -> published."""
from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, NotFoundError
from app.models.generated_content import GeneratedContent

logger = logging.getLogger(__name__)

VALID_TRANSITIONS = {
    "draft": ["ready"],
    "ready": ["draft", "published"],
    "published": ["ready"],
}


async def update_publish_status(
    content_id: str,
    user_id: str,
    new_status: str,
    db: AsyncSession,
    *,
    scheduled_at: datetime | None = None,
) -> GeneratedContent:
    """Transition the publish status of a generated content record."""
    result = await db.execute(
        select(GeneratedContent).where(
            GeneratedContent.id == content_id,
            GeneratedContent.user_id == user_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise NotFoundError("生成内容不存在")

    if record.status != "completed":
        raise BadRequestError("仅已完成的内容可以变更发布状态")

    allowed = VALID_TRANSITIONS.get(record.publish_status, [])
    if new_status not in allowed:
        raise BadRequestError(
            f"不支持从 '{record.publish_status}' 转换到 '{new_status}'，"
            f"允许的目标状态: {allowed}"
        )

    record.publish_status = new_status
    if scheduled_at and new_status == "ready":
        record.scheduled_at = scheduled_at

    await db.flush()
    logger.info("Content %s publish status: %s -> %s", content_id, record.publish_status, new_status)
    return record
