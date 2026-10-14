"""实时聚合用户资源占用：存储字节数 + 国内/海外社媒账号数。

不读 `SaasSubscription` 上的占用计数器（易漂移），直接 SUM/COUNT —— 单 user_id 上的索引查询，毫秒级。

国内 / 海外按 `platform_code` 区分（海外 = Composio 平台，见 oversea_platforms）。
"""
from __future__ import annotations

import asyncio
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audio import Audio
from app.models.document import Document
from app.models.image import Image
from app.models.tlf_account import TlfAccount
from app.models.video import Video
from app.services.oversea_platforms import OVERSEA_PLATFORM_CODES


AccountRegion = Literal["domestic", "overseas"]


async def get_user_storage_bytes(db: AsyncSession, user_id: str) -> int:
    """SUM(file_size) over images + videos + audios + documents WHERE user_id=?。"""
    totals = await asyncio.gather(
        db.scalar(
            select(func.coalesce(func.sum(Image.file_size), 0)).where(
                Image.user_id == user_id
            )
        ),
        db.scalar(
            select(func.coalesce(func.sum(Video.file_size), 0)).where(
                Video.user_id == user_id
            )
        ),
        db.scalar(
            select(func.coalesce(func.sum(Audio.file_size), 0)).where(
                Audio.user_id == user_id
            )
        ),
        db.scalar(
            select(func.coalesce(func.sum(Document.file_size), 0)).where(
                Document.user_id == user_id
            )
        ),
    )
    return int(sum(int(x or 0) for x in totals))


async def get_user_account_count(
    db: AsyncSession, user_id: str, region: AccountRegion
) -> int:
    """活跃 TlfAccount 计数，按 platform_code 区分国内 / 海外。

    海外 = platform_code ∈ OVERSEA_PLATFORM_CODES（Composio 平台）；国内 = 其余。
    """
    stmt = select(func.count(TlfAccount.id)).where(
        TlfAccount.user_id == user_id,
        TlfAccount.status == "active",
    )
    if region == "overseas":
        stmt = stmt.where(TlfAccount.platform_code.in_(OVERSEA_PLATFORM_CODES))
    else:
        stmt = stmt.where(TlfAccount.platform_code.notin_(OVERSEA_PLATFORM_CODES))
    cnt = await db.scalar(stmt)
    return int(cnt or 0)
