"""C 端仪表盘聚合查询。多租户：按 user_id 严格隔离。"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import to_utc_iso

from app.models.audio import Audio
from app.models.chat_message import ChatMessage
from app.models.chat_session import ChatSession
from app.models.document import Document
from app.models.generated_content import GeneratedContent
from app.models.image import Image
from app.models.tlf_account import TlfAccount
from app.models.tlf_distribution_task import TlfDistributionTask
from app.models.video import Video
from app.services.usage_aggregator import get_user_storage_bytes

# 趋势按「北京自然日」聚合：created_at 存的是 UTC（见 app.core.time），
# 用 CONVERT_TZ(+00:00 → +08:00) 折算到北京日，避免跨零点错位。
_BEIJING_TZ = "+08:00"


async def _count(db: AsyncSession, model, user_id: str) -> int:
    stmt = select(func.count()).select_from(model).where(model.user_id == user_id)
    return int((await db.execute(stmt)).scalar() or 0)


async def get_stats(db: AsyncSession, user_id: str) -> dict:
    """5 类资产的当前用户总数。"""
    return {
        "documents": await _count(db, Document, user_id),
        "images": await _count(db, Image, user_id),
        "videos": await _count(db, Video, user_id),
        "chats": await _count(db, ChatSession, user_id),
        "generations": await _count(db, GeneratedContent, user_id),
    }


async def get_recent_documents(
    db: AsyncSession, user_id: str, *, limit: int = 5
) -> list[dict]:
    """按创建时间倒序拿最近 N 篇文档。"""
    stmt = (
        select(Document)
        .where(Document.user_id == user_id)
        .order_by(Document.created_at.desc())
        .limit(limit)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return [
        {
            "id": str(r.id),
            "title": r.title,
            "fileSize": r.file_size,
            "status": r.status,
            "createdAt": to_utc_iso(r.created_at),
        }
        for r in rows
    ]


# ─────────────────────────── 多维度分析（数据仪表板） ───────────────────────────

def _beijing_day(col):
    """把存储的 UTC created_at 折算到北京日（DATE）。"""
    return func.date(func.convert_tz(col, "+00:00", _BEIJING_TZ))


async def _active_account_count(db: AsyncSession, user_id: str) -> int:
    stmt = (
        select(func.count())
        .select_from(TlfAccount)
        .where(TlfAccount.user_id == user_id, TlfAccount.status == "active")
    )
    return int((await db.execute(stmt)).scalar() or 0)


async def _daily_counts(
    db: AsyncSession, model, user_id: str, cutoff_utc: datetime
) -> dict[str, int]:
    """按北京自然日聚合 model 的创建数量，返回 {'YYYY-MM-DD': count}。"""
    day = _beijing_day(model.created_at)
    stmt = (
        select(day.label("d"), func.count().label("c"))
        .where(model.user_id == user_id, model.created_at >= cutoff_utc)
        .group_by(day)
    )
    rows = (await db.execute(stmt)).all()
    return {str(r.d): int(r.c) for r in rows}


async def _group_count(db: AsyncSession, model, col, user_id: str) -> dict[str, int]:
    """按某枚举列分组计数，返回 {value: count}。"""
    stmt = (
        select(col.label("k"), func.count().label("c"))
        .where(model.user_id == user_id)
        .group_by(col)
    )
    rows = (await db.execute(stmt)).all()
    return {str(r.k): int(r.c) for r in rows}


async def get_analytics(db: AsyncSession, user_id: str, *, days: int = 30) -> dict:
    """数据仪表板：上传 / 创作 / 发布 / 对话 / 社媒账号 多维度聚合。

    趋势按北京自然日补齐零值，覆盖最近 `days` 天（含今日）。
    """
    today = date.today()  # 容器 TZ=Asia/Shanghai，得到北京日
    start = today - timedelta(days=days - 1)
    # 北京 start 当天 0 点对应的 UTC 时刻（用于走 created_at 索引过滤）
    cutoff_utc = datetime.combine(start, time.min) - timedelta(hours=8)
    day_list = [(start + timedelta(days=i)).isoformat() for i in range(days)]

    # ── 总量卡片 ──
    documents = await _count(db, Document, user_id)
    images = await _count(db, Image, user_id)
    videos = await _count(db, Video, user_id)
    audios = await _count(db, Audio, user_id)
    totals = {
        "documents": documents,
        "images": images,
        "videos": videos,
        "audios": audios,
        "uploads": documents + images + videos + audios,
        "generations": await _count(db, GeneratedContent, user_id),
        "chats": await _count(db, ChatSession, user_id),
        "messages": await _count(db, ChatMessage, user_id),
        "publishTasks": await _count(db, TlfDistributionTask, user_id),
        "socialAccounts": await _active_account_count(db, user_id),
        "storageBytes": await get_user_storage_bytes(db, user_id),
    }

    # ── 上传趋势（按类型分层） ──
    up_docs = await _daily_counts(db, Document, user_id, cutoff_utc)
    up_imgs = await _daily_counts(db, Image, user_id, cutoff_utc)
    up_vids = await _daily_counts(db, Video, user_id, cutoff_utc)
    up_auds = await _daily_counts(db, Audio, user_id, cutoff_utc)
    upload_trend = [
        {
            "date": d,
            "documents": up_docs.get(d, 0),
            "images": up_imgs.get(d, 0),
            "videos": up_vids.get(d, 0),
            "audios": up_auds.get(d, 0),
        }
        for d in day_list
    ]

    # ── 创作 / 互动 / 发布 趋势 ──
    gen_daily = await _daily_counts(db, GeneratedContent, user_id, cutoff_utc)
    msg_daily = await _daily_counts(db, ChatMessage, user_id, cutoff_utc)
    pub_daily = await _daily_counts(db, TlfDistributionTask, user_id, cutoff_utc)
    activity_trend = [
        {
            "date": d,
            "generations": gen_daily.get(d, 0),
            "messages": msg_daily.get(d, 0),
            "publishes": pub_daily.get(d, 0),
        }
        for d in day_list
    ]

    # ── 生成内容分布 ──
    gen_type = await _group_count(db, GeneratedContent, GeneratedContent.type, user_id)
    generation_by_type = [
        {"key": k, "count": v} for k, v in sorted(gen_type.items())
    ]
    gen_status = await _group_count(db, GeneratedContent, GeneratedContent.status, user_id)
    generation_by_status = [
        {"key": k, "count": v} for k, v in sorted(gen_status.items())
    ]

    # ── 发布按平台（任务数 + 账号成功 / 失败） ──
    pub_stmt = (
        select(
            TlfDistributionTask.platform_code.label("p"),
            func.count().label("tasks"),
            func.coalesce(func.sum(TlfDistributionTask.success_count), 0).label("success"),
            func.coalesce(func.sum(TlfDistributionTask.failed_count), 0).label("failed"),
        )
        .where(TlfDistributionTask.user_id == user_id)
        .group_by(TlfDistributionTask.platform_code)
    )
    publish_by_platform = [
        {
            "platform": r.p,
            "tasks": int(r.tasks),
            "success": int(r.success),
            "failed": int(r.failed),
        }
        for r in (await db.execute(pub_stmt)).all()
    ]

    # ── 社媒账号按平台（仅 active） ──
    acc_stmt = (
        select(TlfAccount.platform_code.label("p"), func.count().label("c"))
        .where(TlfAccount.user_id == user_id, TlfAccount.status == "active")
        .group_by(TlfAccount.platform_code)
    )
    accounts_by_platform = [
        {"platform": r.p, "count": int(r.c)}
        for r in (await db.execute(acc_stmt)).all()
    ]

    return {
        "days": days,
        "totals": totals,
        "uploadTrend": upload_trend,
        "activityTrend": activity_trend,
        "generationByType": generation_by_type,
        "generationByStatus": generation_by_status,
        "publishByPlatform": publish_by_platform,
        "accountsByPlatform": accounts_by_platform,
    }
