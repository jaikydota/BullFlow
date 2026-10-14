"""SDK 发布接口：提交发布任务 / 查询任务详情。"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid as _uuid
from datetime import datetime as _datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.config import settings
from tlf_app.core.database import get_db
from tlf_app.core.dependencies import get_current_app
from tlf_app.core.exceptions import BadRequestError, NotFoundError, ForbiddenError
from tlf_app.models.developer_app import DeveloperApp
from tlf_app.models.media_account import MediaAccount
from tlf_app.models.publish_task import PublishTask
from tlf_app.models.tenant_account_binding import TenantAccountBinding
from tlf_app.models.webhook_event import WebhookEvent
from tlf_app.schemas.common import Page
from tlf_app.schemas.sdk import PublishRequest, PublishTaskResponse
from tlf_app.services import composio_client, composio_spec, lapi_client
from tlf_app.services.account_ops import mark_session_expired
from tlf_app.services.account_resolver import resolve_media_account
from tlf_app.services.platform_policy import assert_links_allowed
from tlf_app.services.platform_registry import provider_of
from tlf_app.services.webhook_forward import forward_event

logger = logging.getLogger(__name__)
from tlf_app.services.proxy_service import (
    disable_proxy_for_account,
    ensure_account_proxy,
    note_account_proxy_failure,
)

router = APIRouter()

_TIMEOUT_MSG = "超时未收到平台回调（已停止）"


async def _finalize_if_timed_out(db: AsyncSession, task: PublishTask) -> None:
    """非终态任务超过超时窗口仍未完成 → 把未回报子任务标记 failed、任务落终态。

    避免上游静默时接入方无限轮询。生效起点：定时发布取 pre_pub_time，否则取 created_at。
    """
    if task.status not in ("pending", "publishing"):
        return
    started = task.created_at.replace(tzinfo=timezone.utc).timestamp()
    if task.pre_pub_time:
        started = max(started, task.pre_pub_time / 1000.0)
    if time.time() < started + settings.PUBLISH_TASK_TIMEOUT_SECONDS:
        return

    summary = list(task.result_summary or [])
    reported = {i.get("subTaskId"): i for i in summary if i.get("subTaskId")}
    for snap in (task.account_snapshot or []):
        stid = snap.get("subTaskId")
        if not stid:
            continue
        item = reported.get(stid)
        if item is None:
            summary.append({"subTaskId": stid, "status": "failed", "errorMessage": _TIMEOUT_MSG})
        elif item.get("status") not in ("success", "failed"):
            item["status"] = "failed"
            item["errorMessage"] = item.get("errorMessage") or _TIMEOUT_MSG
    task.result_summary = summary
    task.success_count = sum(1 for i in summary if i.get("status") == "success")
    task.failed_count = sum(1 for i in summary if i.get("status") == "failed")
    task.status = "success" if (task.failed_count == 0 and task.success_count > 0) else (
        "partial" if task.success_count > 0 else "failed"
    )
    if task.success_count == 0 and not task.error_message:
        task.error_message = _TIMEOUT_MSG
    await db.commit()
    await db.refresh(task)


@router.post("/publish", response_model=PublishTaskResponse)
async def publish(
    body: PublishRequest,
    background_tasks: BackgroundTasks,
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
):
    """提交发布任务。account_ids 为稳定 acc_xxx（兼容老灵径 id），均须已绑定当前租户。"""
    # 解析 token（acc_xxx 或老灵径 id）→ media，并校验归属 + 状态 + 平台 + 有可用底层会话
    medias: list[MediaAccount] = []
    unbound: list[str] = []
    euid_by_account: dict[str, str | None] = {}  # composio 发布需 external_user_id（user_id 隔离）
    for token in body.account_ids:
        media = await resolve_media_account(db, token)
        if media is None:
            unbound.append(token)
            continue
        binding = (await db.execute(
            select(TenantAccountBinding)
            .where(TenantAccountBinding.app_id == current_app.id)
            .where(TenantAccountBinding.account_id == media.account_id)
            .where(TenantAccountBinding.status == "active")
        )).scalar_one_or_none()
        if binding is None:
            unbound.append(token)
            continue
        medias.append(media)
        euid_by_account[media.account_id] = binding.external_user_id
    if unbound:
        raise ForbiddenError(f"以下账号未绑定到当前租户：{unbound}")

    provider = provider_of(body.platform_code)
    for m in medias:
        if m.status != "active":
            raise BadRequestError(f"账号 {m.account_id} 状态={m.status}，无法发布")
        if m.platform_code != body.platform_code:
            raise BadRequestError(f"账号 {m.account_id} 平台={m.platform_code} 与请求 {body.platform_code} 不一致")
        if provider == "lapi" and not m.current_lapi_account_id:
            raise BadRequestError(f"账号 {m.account_id} 无可用底层会话，请重新授权")
        if provider == "composio" and not m.provider_account_ref:
            raise BadRequestError(f"账号 {m.account_id} 海外连接已失效，请重新授权")
    # 平台策略：后台关闭了该平台「含链接发帖」（如 X 含链接帖子按次计费贵 13 倍）时，内容含 URL / 裸域名
    # 则在受理前同步拒绝（40000）——不建任务、不调上游、不产生费用
    await assert_links_allowed(db, body.platform_code, body.title, body.body, body.html_content)

    # 发布 = 「使用」：打活跃戳，供不活跃自动回收判定（见 services/inactive_reaper.py）
    _used_now = _datetime.utcnow()
    for m in medias:
        m.last_used_at = _used_now

    # 子任务 ID：优先用子租户传入的（保证两边 + 灵径用同一组，webhook 才能对上）；
    # 缺省或长度不符则网关自生成。
    if body.sub_task_ids and len(body.sub_task_ids) == len(medias):
        sub_task_ids = list(body.sub_task_ids)
    else:
        sub_task_ids = [str(_uuid.uuid4()) for _ in medias]

    task = PublishTask(
        app_id=current_app.id,
        external_content_id=body.external_content_id,
        content_payload={"title": body.title, "publish_kind": body.publish_kind},
        platform_code=body.platform_code,
        target_lapi_account_ids=[m.account_id for m in medias],
        account_snapshot=[
            {
                "accountId": m.account_id,
                "lapiAccountId": m.current_lapi_account_id,  # 当前灵径会话（webhook 回流仍按 subTaskId 匹配）
                "subTaskId": sub_tid,
                "platformUserId": m.platform_user_id,
                "platformUserName": m.platform_user_name,
                "platformAvatar": m.platform_avatar,
            }
            for m, sub_tid in zip(medias, sub_task_ids, strict=True)
        ],
        status="pending",
        provider=provider,
        total_count=len(medias),
        pre_pub_time=body.pre_pub_time,
    )
    db.add(task)
    await db.flush()

    # 海外平台(Composio)：直接执行 toolkit action，同步落结果（无代理、无 webhook 等待）
    if provider == "composio":
        return await _composio_publish(
            db, background_tasks, current_app, task, medias, sub_task_ids, body, euid_by_account,
        )

    # 调灵径：用各 media 的当前灵径会话 id 作为 authorInfo.id
    # 为首个账号分配代理（同平台所有账号在灵径侧共用同一 proxy 字段——按首账号的代理算）
    proxy = await ensure_account_proxy(db, medias[0].current_lapi_account_id)
    cb = {
        "app_id": current_app.app_id,
        "task_id": task.id,
        "external_content_id": body.external_content_id,
    }
    extras = {
        "visible_type": body.visible_type,
        "statement": body.statement,
        "pre_pub_time": body.pre_pub_time,
        "topics": body.topics,
        "tags": body.tags,
        "location": body.location,
        "create_type": body.create_type,
        "category": body.category,
        "sub_category": body.sub_category,
    }
    content_payload = {
        "title": body.title,
        "body": body.body,
        "videoUrl": body.video_url,
        "covers": body.cover_urls or [],
        "mediaUrls": body.media_urls or [],
        "content": body.html_content,
    }
    try:
        result = await lapi_client.submit_publish(
            lapi_account_ids=[m.current_lapi_account_id for m in medias],
            content=content_payload,
            callback_data=cb,
            publish_type=body.publish_kind,
            sub_task_ids=sub_task_ids,
            proxy=proxy,
            platform_code=body.platform_code,
            extras=extras,
        )
    except lapi_client.LapiBusinessError as exc:
        # 提交发布时上游报登录态失效 → 把本次涉及的账号置 expired（引导重新扫码）
        if lapi_client.is_login_expired(exc):
            for m in medias:
                if m.current_lapi_account_id:
                    await mark_session_expired(db, m.current_lapi_account_id)
            await db.commit()
        # 上游报代理异常（Socks5 认证失败等）→ 禁用该代理 + 解绑其上所有账号（下次自动改分）
        elif lapi_client.is_proxy_error(exc) and medias and medias[0].current_lapi_account_id:
            await disable_proxy_for_account(
                db, medias[0].current_lapi_account_id,
                reason=getattr(exc, "lapi_message", "") or str(exc),
            )
            await db.commit()
        raise
    except lapi_client.LapiGatewayError as exc:
        # 发布超时/网络异常 → 记一次「灵径侧代理失败」，连续达阈值则禁用代理+迁移
        task.status = "failed"
        task.error_message = str(exc)[:1000]
        if medias and medias[0].current_lapi_account_id:
            await note_account_proxy_failure(
                db, medias[0].current_lapi_account_id,
                reason=getattr(exc, "message", "") or str(exc),
            )
        await db.commit()
        raise
    task.lapi_operation_id = str(result.get("operationId") or "") or None
    task.status = "publishing"
    # 灵径已受理（上面已调用）。这里必须 commit + refresh：
    # 1) commit 落库，避免响应序列化异常导致 task 回滚 → 与灵径侧产生孤儿任务（webhook 回来找不到）；
    # 2) refresh 把 server_default 列（success/failed_count、created/updated_at）加载进对象，
    #    否则 model_validate 触发懒加载 IO，在异步 greenlet 外报 MissingGreenlet。
    await db.commit()
    await db.refresh(task)
    return PublishTaskResponse.model_validate(task)


def _extract_post_id(data) -> str | None:
    """从 Composio action 返回 data 里尽量挖出帖子 id（各平台字段不同，挖不到返回 None）。"""
    if not isinstance(data, dict):
        return None
    for k in ("id", "tweet_id", "post_id", "ids", "permalink", "url"):
        v = data.get(k)
        if v:
            return str(v)
    # 常见嵌套 data.data.id
    inner = data.get("data")
    if isinstance(inner, dict):
        for k in ("id", "tweet_id", "post_id"):
            if inner.get(k):
                return str(inner[k])
    return None


async def _facebook_publish(media: MediaAccount, content: dict, euid: str) -> dict:
    """Facebook 只能发到公共主页(Page)：查 /me/accounts 取第一个 Page 发；无 Page 给明确提示。"""
    pages = await composio_client.proxy_get(
        media.provider_account_ref, "https://graph.facebook.com/me/accounts?fields=id,name",
    )
    page_list = pages.get("data") or []
    if not page_list:
        return {"successful": False, "data": None,
                "error": "Facebook 发帖需要一个公共主页（Page）；当前账号没有 Page，请先在 Facebook 创建主页后重试。"}
    page_id = (page_list[0] or {}).get("id")
    message = (content.get("body") or content.get("title") or "").strip()
    video_url = content.get("videoUrl")
    if video_url:
        # 视频帖：发到 Page（file_url 接受公网视频 URL）
        return await composio_client.execute_action(
            "FACEBOOK_CREATE_VIDEO_POST", euid,
            {"page_id": page_id, "file_url": video_url,
             "title": (content.get("title") or "").strip() or None, "description": message,
             "published": True},
            connection_id=media.provider_account_ref,
        )
    images = [m for m in (content.get("mediaUrls") or content.get("covers") or []) if m]
    if len(images) > 1:
        # 多图：UPLOAD_PHOTOS_BATCH（photo_urls 最多 50）。注意该 action 不带文案（message）
        return await composio_client.execute_action(
            "FACEBOOK_UPLOAD_PHOTOS_BATCH", euid,
            {"page_id": page_id, "photo_urls": images[:50], "published": True},
            connection_id=media.provider_account_ref,
        )
    if images:
        # 单图 + 文案：发图帖（url 接受公网图片 URL，Facebook 自行抓取）
        return await composio_client.execute_action(
            "FACEBOOK_CREATE_PHOTO_POST", euid,
            {"page_id": page_id, "url": images[0], "message": message, "published": True},
            connection_id=media.provider_account_ref,
        )
    return await composio_client.execute_action(
        "FACEBOOK_CREATE_POST", euid,
        {"page_id": page_id, "message": message, "published": True},
        connection_id=media.provider_account_ref,
    )


# X 视频 / GIF 上传后要等平台转码（30–120 秒）；上传 action 文档建议每 3–5 秒轮询、总超时 60–120 秒
_X_MEDIA_POLL_INTERVAL = 4
_X_MEDIA_POLL_TIMEOUT = 150
_X_GIF_SUFFIXES = (".gif",)


def _extract_media_id(res: dict) -> str | None:
    """从 Twitter 上传 action 返回里取 media id。

    发帖只认**纯数字**的 media id（`media_key` 形如 `3_1234` 不能用）。两个上传 action 返回层级不同：
    `TWITTER_UPLOAD_MEDIA` 是 `data.data.id`（带 data 包裹），`TWITTER_UPLOAD_LARGE_MEDIA` 是
    `data.media_id_string` / `data.id`。逐层兜底取，非数字的一律丢弃。
    """
    data = res.get("data")
    if not isinstance(data, dict):
        return None
    inner = data.get("data") if isinstance(data.get("data"), dict) else data
    for key in ("media_id_string", "media_id", "id"):
        value = inner.get(key) or data.get(key)
        if value and str(value).isdigit():
            return str(value)
    return None


def _processing_state(res: dict) -> str | None:
    """取上传 / 状态查询返回里的 `processing_info.state`；图片没有该字段 → None。"""
    data = res.get("data")
    if not isinstance(data, dict):
        return None
    inner = data.get("data") if isinstance(data.get("data"), dict) else {}
    for node in (data, inner):
        info = node.get("processing_info")
        if isinstance(info, dict) and info.get("state"):
            return str(info["state"]).lower()
    return None


async def _twitter_wait_processing(euid: str, conn: str | None, media_id: str, first: dict) -> str | None:
    """轮询 X 侧媒体转码直到 succeeded。返回错误文案；None = 可以发帖。

    视频 / GIF 上传后 X 要 30–120 秒处理，未到 succeeded 就把 media id 塞进推文会被拒；
    图片返回里没有 processing_info，直接放行。`failed` 是终态，只能重新上传。
    """
    state = _processing_state(first)
    if state in (None, "succeeded"):
        return None
    deadline = time.monotonic() + _X_MEDIA_POLL_TIMEOUT
    while state not in ("succeeded", "failed") and time.monotonic() < deadline:
        await asyncio.sleep(_X_MEDIA_POLL_INTERVAL)
        res = await composio_client.execute_action(
            "TWITTER_GET_MEDIA_UPLOAD_STATUS", euid, {"media_id": media_id}, connection_id=conn,
        )
        if not res.get("successful"):
            return f"查询 X 媒体处理状态失败：{str(res.get('error') or '')[:200]}"
        state = _processing_state(res) or "succeeded"
    if state == "succeeded":
        return None
    if state == "failed":
        return "X 侧媒体转码失败（格式 / 时长不符：视频需 ≤ 140 秒、≤ 512MB）"
    return f"X 侧媒体处理超时（> {_X_MEDIA_POLL_TIMEOUT}s 仍未完成）"


async def _twitter_upload_one(
    euid: str, conn: str | None, url: str, *, video: bool,
) -> tuple[str | None, dict]:
    """上传单个素材换 media id。返回 (media_id, 结果 dict)；media_id 为 None 表示失败，结果 dict 带 error。

    图片走 `TWITTER_UPLOAD_MEDIA`（仅图片、≤ 5MB，无需等转码）；视频 / GIF 走
    `TWITTER_UPLOAD_LARGE_MEDIA`（分片上传 + 轮询转码）。图片若因超 5MB 等被前者拒绝，自动改走后者
    （不传 media_category，由上游按 mimetype 自动判定）。
    """
    is_gif = url.lower().split("?", 1)[0].endswith(_X_GIF_SUFFIXES)
    if not video and not is_gif:
        res = await composio_client.execute_action(
            "TWITTER_UPLOAD_MEDIA", euid,
            {"media": url, "media_category": "tweet_image"},
            connection_id=conn,
        )
        if res.get("successful"):
            mid = _extract_media_id(res)
            if mid:
                return mid, res
            return None, {"successful": False, "data": res.get("data"), "error": "未获取到 X 图片的 media id"}
        logger.info("[twitter] UPLOAD_MEDIA 失败，改走 LARGE 重试：%s", str(res.get("error") or "")[:200])

    args: dict = {"media": url}
    if video:
        args["media_category"] = "tweet_video"
    elif is_gif:
        args["media_category"] = "tweet_gif"
    res = await composio_client.execute_action(
        "TWITTER_UPLOAD_LARGE_MEDIA", euid, args, connection_id=conn,
    )
    if not res.get("successful"):
        return None, res
    mid = _extract_media_id(res)
    if not mid:
        return None, {"successful": False, "data": res.get("data"), "error": "未获取到 X 素材的 media id"}
    err = await _twitter_wait_processing(euid, conn, mid, res)
    if err:
        return None, {"successful": False, "data": res.get("data"), "error": err}
    return mid, res


async def _twitter_publish(media: MediaAccount, content: dict, euid: str) -> dict:
    """X/Twitter 发帖：有素材先上传换 media id，再带 `media_media_ids` 发帖。

    与其它海外平台不同，X 的发帖接口**不接受素材 URL**，只认已上传的 media id（一条最多 4 个，
    且图片与视频不可混用）。上传 action 的 `media` 字段是 Composio FileUploadable，客户端已开
    auto-upload，故这里仍可直接传公网 URL，由 SDK 负责下载转存。
    ⚠️ 视频要等 X 转码（可达 2 分钟），本请求是同步的，接入方 HTTP 超时需 ≥ 3 分钟。
    """
    conn = media.provider_account_ref
    text = (content.get("body") or content.get("title") or "").strip()
    media_ids: list[str] = []

    video_url = content.get("videoUrl")
    if video_url:
        mid, res = await _twitter_upload_one(euid, conn, video_url, video=True)
        if not mid:
            return res
        media_ids.append(mid)
    else:
        images = [i for i in (content.get("mediaUrls") or content.get("covers") or []) if i]
        for img in images[:4]:  # X 单条最多 4 张图
            mid, res = await _twitter_upload_one(euid, conn, img, video=False)
            if not mid:
                return res
            media_ids.append(mid)

    if not text and not media_ids:
        return {"successful": False, "data": None, "error": "X 发帖需要正文或至少一个素材"}

    args: dict = {}
    if text:
        args["text"] = text
    if media_ids:
        args["media_media_ids"] = media_ids
    return await composio_client.execute_action(
        "TWITTER_CREATION_OF_A_POST", euid, args, connection_id=conn,
    )


async def _instagram_publish(media: MediaAccount, content: dict, euid: str) -> dict:
    """Instagram 两步发布：先建图片容器拿 creation_id，再 CREATE_POST。须含图片。"""
    ig_user_id = media.platform_user_id
    caption = (content.get("body") or content.get("title") or "").strip()
    video_url = content.get("videoUrl")
    if video_url:
        # 视频走 Reels（Graph API 已废弃单视频 VIDEO 类型，须 media_type=REELS）；可选封面 cover_url
        covers = [c for c in (content.get("covers") or []) if c]
        args = {"ig_user_id": ig_user_id, "video_url": video_url, "media_type": "REELS", "caption": caption}
        if covers:
            args["cover_url"] = covers[0]
        container = await composio_client.execute_action(
            "INSTAGRAM_CREATE_MEDIA_CONTAINER", euid, args,
            connection_id=media.provider_account_ref,
        )
        if not container.get("successful"):
            return container
        data = container.get("data") or {}
        creation_id = data.get("id") or (data.get("data") or {}).get("id") if isinstance(data, dict) else None
        if not creation_id:
            return {"successful": False, "data": data, "error": "未获取到 Instagram Reels 容器 id"}
        return await composio_client.execute_action(
            "INSTAGRAM_CREATE_POST", euid,
            {"ig_user_id": ig_user_id, "creation_id": creation_id},
            connection_id=media.provider_account_ref,
        )
    images = [i for i in (content.get("mediaUrls") or content.get("covers") or []) if i]
    if not images:
        return {"successful": False, "data": None, "error": "Instagram 必须含图片或视频"}
    if len(images) == 1:
        container = await composio_client.execute_action(
            "INSTAGRAM_CREATE_MEDIA_CONTAINER", euid,
            {"ig_user_id": ig_user_id, "image_url": images[0], "caption": caption, "content_type": "photo"},
            connection_id=media.provider_account_ref,
        )
    else:
        # 多图轮播（2–10 张）：CREATE_CAROUSEL_CONTAINER 直接收 child_image_urls，一步建容器
        container = await composio_client.execute_action(
            "INSTAGRAM_CREATE_CAROUSEL_CONTAINER", euid,
            {"ig_user_id": ig_user_id, "child_image_urls": images[:10], "caption": caption},
            connection_id=media.provider_account_ref,
        )
    if not container.get("successful"):
        return container
    data = container.get("data") or {}
    creation_id = None
    if isinstance(data, dict):
        creation_id = data.get("id") or (data.get("data") or {}).get("id")
    if not creation_id:
        return {"successful": False, "data": data, "error": "未获取到 Instagram 媒体容器 id"}
    return await composio_client.execute_action(
        "INSTAGRAM_CREATE_POST", euid,
        {"ig_user_id": ig_user_id, "creation_id": creation_id},
        connection_id=media.provider_account_ref,
    )


async def _forward_composio_publish_results(
    db: AsyncSession,
    background_tasks: BackgroundTasks,
    app: DeveloperApp,
    task: PublishTask,
    summary: list[dict],
    publish_kind: str,
) -> None:
    """海外发布是同步完成的（Composio 不为发帖发 webhook），故由网关主动按子任务构造
    `publishResult` 转发回下游（如本仓库 backend），对齐灵径异步回调链路——否则下游任务一直卡「发布中」。
    """
    if not app.webhook_url:
        logger.info("[composio-publish] 租户无 webhook_url，结果不转发 task=%s", task.id)
        return
    for item in summary:
        stid = item.get("subTaskId")
        if not stid:
            continue
        forward_body = {
            "type": "web",
            "data": {
                "event": "publishResult",
                "publishType": publish_kind,
                "taskId": stid,
                "publishId": item.get("publishId"),
                "stages": "push",
                "stageStatus": "success" if item.get("status") == "success" else "fail",
                "errorMessage": item.get("errorMessage"),
                "callBackData": {
                    # 下游（如本仓库 backend）按 external_content_id 定位本地发布任务
                    "external_content_id": task.external_content_id,
                    "app_id": app.app_id,
                },
            },
        }
        event = WebhookEvent(
            app_id=app.id,
            lapi_event_type="publishResult",
            raw_payload=forward_body,
            raw_body_text=json.dumps(forward_body, ensure_ascii=False),
            signature_ok=1,
            forward_status="pending",
            forward_attempts=0,
        )
        db.add(event)
        await db.flush()
        background_tasks.add_task(forward_event, event.id)
    await db.commit()


async def _composio_publish(
    db: AsyncSession,
    background_tasks: BackgroundTasks,
    current_app: DeveloperApp,
    task: PublishTask,
    medias: list[MediaAccount],
    sub_task_ids: list[str],
    body: PublishRequest,
    euid_by_account: dict[str, str | None],
) -> PublishTaskResponse:
    """海外平台发布：对每个连接账号直接执行 toolkit action，同步写每账号结果 + 落终态。"""
    action = composio_spec.resolve_action(body.platform_code, body.publish_kind)
    content = {
        "title": body.title, "body": body.body,
        "videoUrl": body.video_url, "covers": body.cover_urls or [],
        "mediaUrls": body.media_urls or [], "content": body.html_content,
    }
    # 平台特有参数（如 Reddit subreddit）经 body.extra 透传，合并进 extras 供 builder 取用
    extras = {"tags": body.tags, "topics": body.topics, "location": body.location, **(body.extra or {})}
    summary: list[dict] = []

    if not action:
        for stid in sub_task_ids:
            summary.append({"subTaskId": stid, "status": "failed",
                            "errorMessage": f"{body.platform_code} 暂不支持 {body.publish_kind} 发布"})
    else:
        for m, stid in zip(medias, sub_task_ids, strict=True):
            euid = euid_by_account.get(m.account_id)
            if not euid:
                summary.append({"subTaskId": stid, "status": "failed",
                                "errorMessage": "账号缺 external_user_id，无法发布（请重新授权）"})
                continue
            try:
                if body.platform_code == "Instagram":
                    # Instagram 是两步流程（建容器 → 发布），单独处理
                    res = await _instagram_publish(m, content, euid)
                elif body.platform_code == "Facebook":
                    # Facebook 只能发到 Page，需先查 page_id
                    res = await _facebook_publish(m, content, euid)
                elif body.platform_code == "Twitter":
                    # X 发帖不收素材 URL，须先上传换 media id，单独处理
                    res = await _twitter_publish(m, content, euid)
                else:
                    # 每账号单独组 arguments：平台特定字段（如 LinkedIn author=urn:li:person:{platform_user_id}）
                    args = composio_spec.build_arguments(
                        body.platform_code, body.publish_kind, content, extras,
                        account={"platform_user_id": m.platform_user_id},
                    )
                    res = await composio_client.execute_action(
                        action, euid, args, connection_id=m.provider_account_ref,
                    )
                succeeded = bool(res.get("successful"))
                err = res.get("error")
                summary.append({
                    "subTaskId": stid,
                    "status": "success" if succeeded else "failed",
                    "publishId": _extract_post_id(res.get("data")),
                    "errorMessage": None if succeeded else (str(err)[:500] if err else "发布失败"),
                })
            except composio_client.ComposioError as exc:
                summary.append({"subTaskId": stid, "status": "failed",
                                "errorMessage": str(getattr(exc, "message", exc))[:500]})

    task.result_summary = summary
    task.success_count = sum(1 for i in summary if i.get("status") == "success")
    task.failed_count = sum(1 for i in summary if i.get("status") == "failed")
    task.status = ("success" if task.failed_count == 0 and task.success_count > 0
                   else "partial" if task.success_count > 0 else "failed")
    await db.commit()
    await db.refresh(task)
    # 同步发布结果主动转发回下游（对齐灵径 publishResult webhook，否则下游卡「发布中」）
    await _forward_composio_publish_results(
        db, background_tasks, current_app, task, summary, body.publish_kind,
    )
    return PublishTaskResponse.model_validate(task)


@router.get("/tasks", response_model=Page[PublishTaskResponse])
async def list_tasks(
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    platform_code: str | None = Query(None),
):
    from sqlalchemy import func

    base = select(PublishTask).where(PublishTask.app_id == current_app.id)
    if status:
        base = base.where(PublishTask.status == status)
    if platform_code:
        base = base.where(PublishTask.platform_code == platform_code)
    total = (await db.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar_one()
    rows = (await db.execute(
        base.order_by(PublishTask.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    for r in rows:
        await _finalize_if_timed_out(db, r)
    return Page[PublishTaskResponse](
        items=[PublishTaskResponse.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/tasks/{task_id}", response_model=PublishTaskResponse)
async def get_task(
    task_id: str,
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
):
    task = (await db.execute(
        select(PublishTask)
        .where(PublishTask.id == task_id)
        .where(PublishTask.app_id == current_app.id)
    )).scalar_one_or_none()
    if task is None:
        raise NotFoundError("任务不存在或不属于当前租户")
    await _finalize_if_timed_out(db, task)
    return PublishTaskResponse.model_validate(task)
