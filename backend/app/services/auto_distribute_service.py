"""自动分发服务：生成完成后内置发到国内社媒账号。

外部入口：`dispatch_for_record(db, record, schedule_id)`
- 仅当 `schedule.auto_distribute_enabled=True` 时触发
- 平台 + 账号列表来自 schedule.distribute_platform_code / distribute_account_ids
- 仅取 user_id 匹配 + status='active' 的账号（账号下线/删除自动过滤）
- 内容类型推 publish_kind：article→article / image→dynamic / video→video
- 标题按平台官方字数上限从 prompt 或 record.title 截取
- 正文（对齐手动发布）：文章=content 全文；图文/视频=description 发布文案优先
- 图片：media_urls 全部图（回退 file_path 首图）；HTML 文章 markdown→html，纯文 strip-tags
- 失败：仅写 TlfDistributionTask.error_message + 发 distribution.failed 通知，不抛
"""
from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generated_content import GeneratedContent
from app.models.generation_schedule import GenerationSchedule
from app.models.tlf_account import TlfAccount
from app.models.tlf_distribution_task import TlfDistributionTask
from app.services import tlf_client
from app.services import notification_service
from app.services.minio_service import path_to_url

logger = logging.getLogger(__name__)


# ─── 平台支持矩阵：直接复用全量后端镜像 tlf_publish_spec（38 平台，测试断言一致） ──
# 统一以该 spec 为准，避免「前端可选但后端未收录 → 自动分发静默失败」。
from app.services.tlf_publish_spec import platform_supports as _spec_supports
# 海外平台（Composio）不在 tlf_publish_spec 收录范围内，其 (platform, kind) 支持由网关
# composio_spec 判定，这里仅按「是否海外平台」放行，避免本地静默拦截。
from app.services.oversea_platforms import is_oversea_platform

# 字段映射 + 字数/媒体上限统一在 services/tlf_content_payload（自动分发 + 手动预填共用唯一实现）。
from app.services.tlf_content_payload import build_publish_fields

# 平台展示名（用于通知与日志）
_PLATFORM_LABEL: dict[str, str] = {
    "DouYin": "抖音",
    "XiaoHongShu": "小红书",
    "KuaiShou": "快手",
    "BiLiBiLi": "哔哩哔哩",
    "ShiPinHao": "微信视频号",
    "WeiXinGongZhongHao": "微信公众号",
    "XinLangWeiBo": "新浪微博",
    "ZhiHu": "知乎",
    "TouTiaoHao": "头条号",
}


# ─── helpers ─────────────────────────────────────────────────────────────────


def _infer_publish_kind(content_type: str) -> str:
    """content type → TLF publish_kind。"""
    if content_type == "article":
        return "article"
    if content_type == "video":
        return "video"
    # image / 其他 → 图文动态
    return "dynamic"


def _platform_supports(platform_code: str | None, kind: str) -> bool:
    if not platform_code:
        return False
    if is_oversea_platform(platform_code):
        return True  # 海外平台：放行，kind 适配由网关 composio_spec 处理
    return _spec_supports(platform_code, kind)


def _platform_label(platform_code: str | None) -> str:
    if not platform_code:
        return "?"
    return _PLATFORM_LABEL.get(platform_code, platform_code)


def _strip_tags(text: str | None) -> str:
    """去掉 HTML 标签，保留纯文本。"""
    if not text:
        return ""
    return re.sub(r"<[^>]+>", "", text).strip()


def _md_to_html(text: str | None) -> str:
    """Markdown → HTML；markdown 库不可用时回退到 strip_tags 后包 <p>。"""
    if not text:
        return ""
    try:
        import markdown as _md  # type: ignore[import-not-found]
        return _md.markdown(text, extensions=["fenced_code", "tables"])
    except Exception:
        plain = _strip_tags(text)
        return f"<p>{plain}</p>"


@dataclass
class _Payload:
    title: str
    body: str | None
    media_urls: list[str] | None
    video_url: str | None
    cover_urls: list[str] | None
    html_content: str | None


def _build_payload(
    record: GeneratedContent,
    schedule: GenerationSchedule,  # noqa: ARG001 — 保留签名兼容，正文/标题源已统一到 build_publish_fields
    platform_code: str,
    kind: str,
) -> _Payload:
    """从统一映射(build_publish_fields)取字段，再按平台做最终收尾（国内文章 md→html / Reddit 走 markdown）。"""
    f = build_publish_fields(record, [platform_code], kind)

    if kind == "article":
        # 海外文章（Reddit）：上游 self 帖收 markdown 纯文本 body、无封面；国内文章 markdown→HTML。
        if is_oversea_platform(platform_code):
            return _Payload(
                title=f.title, body=f.body or None, media_urls=None,
                video_url=None, cover_urls=None, html_content=None,
            )
        return _Payload(
            title=f.title, body=None, media_urls=None, video_url=None,
            cover_urls=f.covers or None, html_content=_md_to_html(f.body),
        )

    if kind == "video":
        return _Payload(
            title=f.title, body=f.body or None, media_urls=None,
            video_url=f.video_url, cover_urls=f.covers or None, html_content=None,
        )

    # dynamic（图文/纯文）
    return _Payload(
        title=f.title, body=f.body or None, media_urls=f.images or None,
        video_url=None, cover_urls=None, html_content=None,
    )


async def _resolve_active_accounts(
    db: AsyncSession,
    user_id: str,
    platform_code: str,
    account_ids: list[str],
) -> list[TlfAccount]:
    """筛掉已被删除/下线/换主的账号。"""
    if not account_ids:
        return []
    stmt = select(TlfAccount).where(
        TlfAccount.id.in_(account_ids),
        TlfAccount.user_id == user_id,
        TlfAccount.platform_code == platform_code,
        TlfAccount.status == "active",
    )
    return list((await db.execute(stmt)).scalars().all())


async def _notify_distribution_failed(
    db: AsyncSession,
    record: GeneratedContent,
    schedule: GenerationSchedule,
    reason: str,
) -> None:
    """生成成功后分发失败：发一条「分发失败」通知给用户。"""
    try:
        await notification_service.create_notification(
            db,
            user_id=str(record.user_id),
            type="distribution.failed",
            title=f"自动分发失败 · {_platform_label(schedule.distribute_platform_code)}",
            message=(
                f"规则「{schedule.name}」生成了内容「{record.title or '(未命名)'}」，"
                f"但分发失败：{reason}"
            ),
            link_url=f"/generation/library/{record.id}",
            extra={
                "schedule_id": str(schedule.id),
                "content_id": str(record.id),
                "platform_code": schedule.distribute_platform_code,
                "reason": reason[:500],
            },
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("notify distribution failed err: %s", e)


# ─── 核心入口 ────────────────────────────────────────────────────────────────


# 标签实为上游 topics（话题）的 (platform:kind)（mirror 前端 tagsFieldName）
_TOPICS_FIELD_KINDS: set[str] = {"ZhiHu:article", "DouYin:article", "YiCheHao:article"}


def _tags_extra(platform_code: str, kind: str, tags: list | None) -> dict:
    """生成内容的 LLM 标签 → 该平台的 tags/topics 字段（知乎/抖音文章/易车号文章用 topics）。"""
    if not tags:
        return {}
    field = "topics" if f"{platform_code}:{kind}" in _TOPICS_FIELD_KINDS else "tags"
    clean = [str(t).strip() for t in tags if str(t).strip()]
    return {field: clean} if clean else {}


async def _dispatch_one_platform(
    db: AsyncSession,
    record: GeneratedContent,
    schedule: GenerationSchedule,
    platform_code: str,
    kind: str,
    account_ids: list[str],
    extras: dict,
) -> None:
    """向单个平台分发：校验/解析账号 → 构造 payload + extras → 建任务 → 调推量发。失败仅通知不抛。"""
    if not _platform_supports(platform_code, kind):
        msg = f"平台 {_platform_label(platform_code)} 不支持 {kind} 类型"
        logger.warning("auto_distribute: %s schedule=%s", msg, schedule.id)
        await _notify_distribution_failed(db, record, schedule, msg)
        return

    accounts = await _resolve_active_accounts(
        db, str(record.user_id), platform_code, account_ids,
    )
    if not accounts:
        await _notify_distribution_failed(
            db, record, schedule,
            f"{_platform_label(platform_code)}：未找到可用的分发账号（账号可能已下线或删除）",
        )
        return

    payload = _build_payload(record, schedule, platform_code, kind)

    # extras：用户预配（visible_type/statement/create_type/category）+ 内容标签（按平台映射 tags/topics）
    full_extras: dict[str, Any] = dict(extras or {})
    for k, v in _tags_extra(platform_code, kind, record.tags).items():
        full_extras.setdefault(k, v)

    sub_ids = [str(uuid.uuid4()) for _ in accounts]
    task = TlfDistributionTask(
        user_id=str(record.user_id),
        content_id=str(record.id),
        content_snapshot={
            "title": payload.title,
            "type": record.type,
            "publish_kind": kind,
            "cover_url": path_to_url(record.thumbnail_path) or path_to_url(record.file_path),
        },
        platform_code=platform_code,
        target_account_ids=[a.id for a in accounts],
        account_snapshot=[
            {
                "id": a.id,
                "tlfAccountId": a.tlf_account_id,
                "subTaskId": sub_tid,
                "platformUserId": a.platform_user_id,
                "platformUserName": a.platform_user_name,
                "platformAvatar": a.platform_avatar,
            }
            for a, sub_tid in zip(accounts, sub_ids, strict=True)
        ],
        status="pending",
        total_count=len(accounts),
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)

    content_for_tlf: dict[str, Any] = {"title": payload.title}
    if payload.body is not None:
        content_for_tlf["body"] = payload.body
    if payload.media_urls is not None:
        content_for_tlf["mediaUrls"] = payload.media_urls
    if payload.video_url is not None:
        content_for_tlf["videoUrl"] = payload.video_url
    if payload.cover_urls is not None:
        content_for_tlf["covers"] = payload.cover_urls
    if payload.html_content is not None:
        content_for_tlf["content"] = payload.html_content

    try:
        await tlf_client.submit_publish(
            tlf_account_ids=[a.tlf_account_id for a in accounts],
            content=content_for_tlf,
            publish_type=kind,
            platform_code=platform_code,
            sub_task_ids=sub_ids,
            extras=full_extras or None,
            callback_data={"task_id": str(task.id), "user_id": str(record.user_id)},
        )
        task.status = "publishing"
        await db.flush()
        logger.info(
            "auto_distribute: schedule=%s record=%s platform=%s accounts=%d 已提交推量发",
            schedule.id, record.id, platform_code, len(accounts),
        )
    except Exception as e:  # noqa: BLE001
        task.status = "failed"
        task.error_message = str(e)[:1000]
        await db.flush()
        await _notify_distribution_failed(
            db, record, schedule, f"{_platform_label(platform_code)}：{str(e)[:200]}",
        )
        logger.warning(
            "auto_distribute: schedule=%s platform=%s 调推量发失败: %s",
            schedule.id, platform_code, e,
        )


async def dispatch_for_record(
    db: AsyncSession,
    record: GeneratedContent,
    schedule_id: str | None,
) -> None:
    """生成完成钩子。失败不抛——分发问题不连坐生成结果。

    优先用 distribute_config（多平台 + per-platform 账号/extras）；旧规则回退单平台字段。
    """
    if not schedule_id:
        return
    try:
        schedule = await db.get(GenerationSchedule, schedule_id)
    except Exception:  # noqa: BLE001
        logger.warning("dispatch_for_record: load schedule failed", exc_info=True)
        return
    if not schedule or not schedule.auto_distribute_enabled:
        return
    # 安全护栏：**停用中的规则不自动分发**。发帖是外发/不可逆操作——「立刻执行」一个已暂停的
    # 规则只应生成内容入库（用户显式意图），不该意外把内容公开发到社媒（cron 本就不会触发停用
    # 规则；这里专挡「停用规则手动 run-now」这条路径）。要分发请先启用规则。
    if not schedule.is_active:
        logger.info(
            "auto_distribute: schedule=%s 已停用，手动执行只生成不分发 record=%s",
            schedule.id, record.id,
        )
        return

    kind = _infer_publish_kind(record.type)
    cfg = schedule.distribute_config or {}
    platforms = cfg.get("platforms") or []

    if platforms:
        accounts_map = cfg.get("accounts") or {}
        extras_map = cfg.get("extras") or {}
        for code in platforms:
            await _dispatch_one_platform(
                db, record, schedule, code, kind,
                accounts_map.get(code) or [], extras_map.get(code) or {},
            )
        return

    # 回退：旧单平台配置
    if not schedule.distribute_platform_code or not schedule.distribute_account_ids:
        logger.info("auto_distribute: schedule=%s 缺少平台或账号配置，跳过", schedule.id)
        return
    await _dispatch_one_platform(
        db, record, schedule, schedule.distribute_platform_code, kind,
        schedule.distribute_account_ids, {},
    )
