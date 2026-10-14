"""灵径 webhook 入口处理：验签 → 落 webhook_events → 同步本地表 → 触发转发。

事件分发负责更新 lapi_account / publish_task / account_metric 的核心字段。
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from tlf_app.core.config import settings
from tlf_app.core.exceptions import BadRequestError
from tlf_app.core.redis import get_redis
from tlf_app.core.security import verify_webhook_signature
from tlf_app.models.developer_app import DeveloperApp
from tlf_app.models.lapi_account import LapiAccount
from tlf_app.models.media_account import MediaAccount
from tlf_app.models.publish_task import PublishTask
from tlf_app.models.account_metric import AccountMetric
from tlf_app.models.tenant_account_binding import TenantAccountBinding
from tlf_app.models.webhook_event import WebhookEvent
from tlf_app.services import lapi_client
from tlf_app.services.account_resolver import attach_session_to_media, resolve_media_account
from tlf_app.services.author_home_url import (
    build_home_url_from_author_info,
    build_home_url_from_user_id,
    finalize_home_url,
    needs_author_info,
)

logger = logging.getLogger(__name__)


NONCE_TTL = 300  # 与 LAPI_WEBHOOK_MAX_AGE 一致


async def verify_and_log_event(
    db: AsyncSession,
    *,
    raw_body: bytes,
    timestamp: str,
    signature: str,
) -> WebhookEvent:
    """验签 + 时间戳窗口 + nonce 防重放，落 webhook_events，返回 event 对象。

    校验失败抛 BadRequestError。
    """
    # 时间戳窗口
    try:
        ts_int = int(timestamp)
    except (TypeError, ValueError):
        raise BadRequestError("缺少或非法的 X-Webhook-Timestamp")
    now = int(time.time())
    if abs(now - ts_int) > settings.LAPI_WEBHOOK_MAX_AGE:
        raise BadRequestError(f"webhook 时间戳超出 {settings.LAPI_WEBHOOK_MAX_AGE}s 窗口")

    # 签名校验
    ok = verify_webhook_signature(raw_body, timestamp, signature, settings.LAPI_WEBHOOK_SECRET)
    if not ok:
        raise BadRequestError("webhook 签名校验失败")

    # 防重放
    redis = get_redis()
    nonce_key = f"{settings.TLF_REDIS_PREFIX}webhook:nonce:{signature[:64]}"
    setnx = await redis.set(nonce_key, "1", ex=NONCE_TTL, nx=True)
    if not setnx:
        raise BadRequestError("webhook 重复投递（nonce 已存在）")

    # 解析 body
    try:
        body = json.loads(raw_body.decode("utf-8"))
    except Exception as exc:
        raise BadRequestError(f"webhook body 非合法 JSON：{exc}")

    # 灵径推送形态：{ "type": "web", "data": { "event": "...", "callBackData": {...}, ... }, "timestamp": ... }
    # 真正的事件对象在 body["data"]；历史/测试形态可能直接平铺，两者都兼容。
    inner = body.get("data") if isinstance(body.get("data"), dict) and "event" in body["data"] else body
    event_type = str(inner.get("event") or inner.get("eventType") or "unknown")
    callback = inner.get("callBackData") or {}
    app_id_uuid: str | None = None
    raw_app_ref = callback.get("app_id") or callback.get("appId")
    if raw_app_ref:
        # callBackData.app_id 是对外可见的 app_xxx，需查 DeveloperApp 拿到内部 UUID
        app = (await db.execute(
            select(DeveloperApp).where(DeveloperApp.app_id == raw_app_ref)
        )).scalar_one_or_none()
        if app is not None:
            app_id_uuid = app.id

    event = WebhookEvent(
        app_id=app_id_uuid,
        lapi_event_type=event_type,
        raw_payload=body,
        raw_body_text=raw_body.decode("utf-8"),
        signature_ok=1,
        forward_status="pending",
        forward_attempts=0,
    )
    db.add(event)
    await db.flush()
    logger.info(
        "[WEBHOOK-IN] event=%s type=%s app=%s status=%s op=%s task=%s body=%dB",
        event.id, event_type, raw_app_ref or "-", inner.get("status") or "-",
        inner.get("operationId") or "-", inner.get("taskId") or "-", len(raw_body),
    )
    return event


async def apply_event_to_local_tables(db: AsyncSession, event: WebhookEvent) -> None:
    """根据事件类型同步更新本地 lapi_accounts / publish_tasks / account_metrics。

    每个 handler 失败时记录 last_error 但不阻塞 forward。
    """
    body = event.raw_payload or {}
    et = event.lapi_event_type
    try:
        if et == "authResult":
            await _handle_auth_result(db, body, event=event)
        elif et == "publishResult":
            await _handle_publish_result(db, body)
        elif et == "publishProcess":
            await _handle_publish_progress(db, body)
        elif et == "auditStatus":
            await _handle_audit_status(db, body)
        elif et == "accountStatus":
            await _handle_account_status(db, body, event=event)
        elif et == "accountOverview":
            await _handle_account_overview(db, body, event=event)
        else:
            logger.info("[webhook] 未知事件类型 %s，仅记录不处理", et)
        logger.info("[WEBHOOK-APPLY] event=%s type=%s 本地同步完成", event.id, et)
    except Exception as exc:
        logger.exception("[webhook] 本地表同步失败 event=%s type=%s err=%s", event.id, et, exc)


def _rewrite_forward_id(event: WebhookEvent | None, old_id: str | None, new_id: str | None) -> None:
    """把转发给子租户的 webhook body 里的灵径会话 id 改写为稳定 acc_xxx。

    子租户只认 acc_xxx；凡 body 内出现灵径会话 id 的账号类事件（authResult/accountStatus/
    accountOverview）都需改写，否则子租户按未知 id 匹配不上（状态/指标更新丢失，或 403）。
    """
    if event is None or not old_id or not new_id or old_id == new_id:
        return
    if event.raw_body_text and old_id in event.raw_body_text:
        event.raw_body_text = event.raw_body_text.replace(old_id, new_id)
        try:
            event.raw_payload = json.loads(event.raw_body_text)
            flag_modified(event, "raw_payload")
        except Exception as exc:  # noqa: BLE001
            logger.warning("[webhook] 改写转发 body 后重解析失败：%s", exc)
        logger.info("[webhook] 转发 body 账号 id 改写 %s → %s（对齐稳定 acc_xxx）", old_id, new_id)


def _inject_home_url_to_forward(
    event: WebhookEvent | None, home_url: str | None, is_profile: bool
) -> None:
    """把 home_url + is_profile 注入「转发给子租户」的 webhook body 账号详情节点，使消费侧授权即得主页 URL。

    authResult body 形态有两种（扁平 / 外层再包一层 data），账号详情都在「带 platformUserId 的那层」：
    扁平 = body.data；包一层 = body.data.data。注入该层的 `platformHomeUrl` + `platformHomeUrlIsProfile`。
    全程 best-effort，任何异常都不影响主流程与原 body。
    """
    if event is None or not event.raw_body_text or not home_url:
        return
    try:
        payload = json.loads(event.raw_body_text)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[webhook-auth] 注入 home_url 前解析 body 失败，跳过：%s", exc)
        return
    node = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(node, dict):
        return
    # 账号详情层：若 node 自身再嵌一层 data（外包形态）取内层，否则 node 即账号详情层（扁平形态）
    target = node.get("data") if isinstance(node.get("data"), dict) else node
    target["platformHomeUrl"] = home_url
    target["platformHomeUrlIsProfile"] = is_profile
    try:
        event.raw_body_text = json.dumps(payload, ensure_ascii=False)
        event.raw_payload = payload
        flag_modified(event, "raw_payload")
    except Exception as exc:  # noqa: BLE001
        logger.warning("[webhook-auth] 注入 home_url 后重序列化失败，跳过：%s", exc)


async def _populate_home_url(
    db: AsyncSession, media: MediaAccount, lapi_account_id: str, event: WebhookEvent | None
) -> None:
    """授权成功后拼用户主页 URL，落 media + 注入转发 body。

    优先用 platform_user_id 直接拼用户主页（小红书/B站/微博/知乎/豆瓣/简书/AcFun，无需网络）；
    拼不出且该平台需作者信息才能拼（如抖音 sec_uid）时，才 best-effort 调作者信息接口
    （刚授权 cookie 最新；登录态/未开通/拼不出一律静默降级）。**拿不到用户主页则退平台站点首页**
    （finalize_home_url），下游不再兜底：直接用 platform_home_url + home_url_is_profile。
    """
    # 1) platform_user_id 直接拼用户主页（无网络、不依赖 cookie）
    profile_url = build_home_url_from_user_id(media.platform_code, media.platform_user_id)
    # 2) 拼不出且该平台需作者信息（抖音 sec_uid）→ best-effort 调作者信息接口
    if not profile_url and needs_author_info(media.platform_code):
        try:
            info = await lapi_client.get_author_info(lapi_account_id)
            profile_url = build_home_url_from_author_info(media.platform_code, info)
        except lapi_client.LapiBusinessError as exc:
            logger.info("[webhook-auth] 作者信息不可用（登录态/未开通等），退站点首页：%s", exc)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[webhook-auth] 取作者信息失败（退站点首页）：%s", exc)
    # 3) 收敛：用户主页优先，否则平台站点首页（兜底在网关内完成）
    home_url, is_profile = finalize_home_url(media.platform_code, profile_url)
    media.platform_home_url = home_url
    media.home_url_is_profile = is_profile
    _inject_home_url_to_forward(event, home_url, is_profile)
    logger.info(
        "[webhook-auth] home_url account=%s platform=%s is_profile=%s",
        media.account_id, media.platform_code, is_profile,
    )


async def _handle_auth_result(
    db: AsyncSession, body: dict[str, Any], event: WebhookEvent | None = None
) -> None:
    # body 是完整 webhook；事件对象在 body["data"]，账号信息再嵌一层 body["data"]["data"]（仅 SUCCESS）
    evt = body.get("data") if isinstance(body.get("data"), dict) and "event" in body["data"] else body
    status = (evt.get("status") or "").upper()
    redis = get_redis()
    operation_id = evt.get("operationId")
    callback = evt.get("callBackData") or {}
    acct = evt.get("data") or {}  # 账号详情（SUCCESS 时才有）

    # auth-op 状态供前端轮询
    state = {
        "status": "success" if status == "SUCCESS" else ("failed" if status in ("FAILED", "FAIL") else "pending"),
        "platformUserName": acct.get("platformUserName"),
        "platformUserId": acct.get("platformUserId"),
        "lapiAccountId": acct.get("id") or acct.get("accountId"),
        "errorMessage": evt.get("errorMessage"),
    }
    if operation_id:
        await redis.set(
            f"{settings.TLF_REDIS_PREFIX}auth-op:{operation_id}",
            json.dumps(state),
            ex=settings.AUTH_OP_STATE_TTL_SECONDS,
        )

    if status != "SUCCESS":
        return

    lapi_account_id = acct.get("id") or acct.get("accountId")
    if not lapi_account_id:
        logger.warning("[webhook-auth] SUCCESS 但缺账号 id，op=%s", operation_id)
        return

    # 取本次授权时 auth/start 暂存的代理（tlf:auth-proxy:{operationId}）+ 代理区域，挂到本次会话
    stashed_proxy_id: str | None = None
    stashed_region: str | None = None
    if operation_id:
        try:
            stashed_proxy_id = await redis.get(f"{settings.TLF_REDIS_PREFIX}auth-proxy:{operation_id}")
        except Exception as exc:
            logger.warning("[webhook-auth] 读取授权代理失败 op=%s: %s", operation_id, exc)
        try:
            stashed_region = await redis.get(f"{settings.TLF_REDIS_PREFIX}auth-region:{operation_id}")
        except Exception as exc:
            logger.warning("[webhook-auth] 读取授权代理区域失败 op=%s: %s", operation_id, exc)

    # ===== 扫码落账 + 去重（统一走 media 层）=====
    # 灵径每次扫码新建一条会话（新 lapi_account_id），哪怕同一物理号。attach_session_to_media
    # 找/建稳定账号 media、把本次会话挂上并置 current、**软删该 media 下其它 active 会话**
    # （灵径 revoke 省钱 + 本地标 revoked 保留作别名）。租户只认 media.account_id（acc_xxx）。
    now = datetime.utcnow()
    media = await attach_session_to_media(
        db,
        lapi_account_id=lapi_account_id,
        platform_code=str(acct.get("platformCode") or callback.get("platform_code") or ""),
        platform_user_id=str(acct.get("platformUserId") or ""),
        platform_user_name=acct.get("platformUserName"),
        platform_avatar=acct.get("platformAvatar"),
        now=now,
        proxy_id=stashed_proxy_id,
        proxy_region=stashed_region,
    )
    account_id = media.account_id

    # 覆写 auth-op 状态：对外暴露稳定 acc_xxx（lapiAccountId 镜像同值，兼容旧轮询）
    state["accountId"] = account_id
    state["lapiAccountId"] = account_id
    if operation_id:
        try:
            await redis.set(
                f"{settings.TLF_REDIS_PREFIX}auth-op:{operation_id}",
                json.dumps(state), ex=settings.AUTH_OP_STATE_TTL_SECONDS,
            )
        except Exception as exc:
            logger.warning("[webhook-auth] 覆写 auth-op 状态失败 op=%s: %s", operation_id, exc)

    # 🔴 关键：把「转发给子租户」的 webhook body 里的账号 id 改写为稳定 acc_xxx。
    # 转发器读 event.raw_body_text 原样透传，若不改写，子租户会存下灵径会话 id —— 该 id 在
    # 去重/下次扫码后会被 revoke，随后按它的请求就会 403。改写后子租户存的是 acc_xxx，
    # 与 auth-op 轮询 / GET accounts 三条下发路径统一，且永不失效。
    _rewrite_forward_id(event, lapi_account_id, account_id)

    # best-effort：取作者信息拼用户主页 URL（cookie 刚授权最新），落 media + 注入转发 body。
    # 失败/拼不出留空不阻塞——可拼主页的平台（当前抖音）才会实际产生 URL。
    await _populate_home_url(db, media, lapi_account_id, event)

    # 把稳定账号绑定到发起授权的子租户（callBackData.app_id），否则后续发布会 403
    app_ref = callback.get("app_id") or callback.get("appId")
    if app_ref:
        app = (await db.execute(
            select(DeveloperApp).where(DeveloperApp.app_id == app_ref)
        )).scalar_one_or_none()
        if app is not None:
            # 发起扫码的终端用户（用于代理 IP 粘性：同一用户的多个账号尽量同代理）
            euid = callback.get("external_user_id") or callback.get("externalUserId")
            binding = (await db.execute(
                select(TenantAccountBinding)
                .where(TenantAccountBinding.app_id == app.id)
                .where(TenantAccountBinding.account_id == account_id)
            )).scalar_one_or_none()
            if binding is None:
                db.add(TenantAccountBinding(
                    app_id=app.id,
                    account_id=account_id,
                    external_user_id=euid,
                    status="active",
                    bound_at=now,
                ))
            else:
                if binding.status != "active":
                    binding.status = "active"
                # 回填终端用户（历史 binding 或之前未带时）
                if euid and not binding.external_user_id:
                    binding.external_user_id = euid
            await db.flush()


def _inner_event(body: dict[str, Any]) -> dict[str, Any]:
    """取内层事件对象：{type, data:{event,...}, ts} → data；已是平铺则原样返回。"""
    inner = body.get("data")
    if isinstance(inner, dict) and "event" in inner:
        return inner
    return body


async def _find_task_by_operation(db: AsyncSession, body: dict[str, Any]) -> PublishTask | None:
    """发布回调按 callBackData.task_id（= 本网关 PublishTask.id）定位任务；
    灵径 publish 接口不返回 operationId，故主键匹配，operationId 仅作兜底。"""
    evt = _inner_event(body)
    cb = evt.get("callBackData") or {}
    task_id = cb.get("task_id")
    if task_id:
        task = (await db.execute(
            select(PublishTask).where(PublishTask.id == task_id)
        )).scalar_one_or_none()
        if task is not None:
            return task
    op_id = evt.get("operationId")
    if op_id:
        return (await db.execute(
            select(PublishTask).where(PublishTask.lapi_operation_id == op_id)
        )).scalar_one_or_none()
    return None


def _norm_stage_status(value: str | None) -> str:
    """灵径 stageStatus → 归一化 success / failed / ''（进行中）。"""
    s = (value or "").lower()
    if s in ("success", "succeed", "succeeded", "ok"):
        return "success"
    if s in ("fail", "failed", "error"):
        return "failed"
    return ""


async def _handle_publish_result(db: AsyncSession, body: dict[str, Any]) -> None:
    task = await _find_task_by_operation(db, body)
    if task is None:
        return
    data = _inner_event(body)
    sub_task_id = data.get("taskId")
    # 灵径用 stageStatus；兼容 status
    status = _norm_stage_status(data.get("stageStatus") or data.get("status"))
    if not sub_task_id:
        return
    summary = list(task.result_summary or [])
    found = False
    for item in summary:
        if item.get("subTaskId") == sub_task_id:
            item["status"] = status
            item["publishId"] = data.get("publishId") or item.get("publishId")
            item["errorMessage"] = data.get("errorMessage")
            found = True
            break
    if not found:
        summary.append({
            "subTaskId": sub_task_id,
            "status": status,
            "publishId": data.get("publishId"),
            "errorMessage": data.get("errorMessage"),
        })
    task.result_summary = summary
    task.success_count = sum(1 for i in summary if i.get("status") == "success")
    task.failed_count = sum(1 for i in summary if i.get("status") == "failed")
    if task.success_count + task.failed_count >= task.total_count:
        if task.failed_count == 0:
            task.status = "success"
        elif task.success_count == 0:
            task.status = "failed"
        else:
            task.status = "partial"
    elif task.status == "pending":
        task.status = "publishing"
    await db.flush()


async def _handle_publish_progress(db: AsyncSession, body: dict[str, Any]) -> None:
    # 进度仅在非终态时更新（迟到进度不覆盖最终态）
    task = await _find_task_by_operation(db, body)
    if task is None:
        return
    data = body.get("data") or {}
    sub_task_id = data.get("taskId")
    if not sub_task_id:
        return
    summary = list(task.result_summary or [])
    for item in summary:
        if item.get("subTaskId") == sub_task_id:
            if item.get("status") in ("success", "failed"):
                return
            item["progress"] = {
                "stage": data.get("stage"),
                "stageStatus": data.get("stageStatus"),
                "uploadedParts": data.get("uploadedParts"),
                "totalParts": data.get("totalParts"),
            }
            break
    else:
        summary.append({"subTaskId": sub_task_id, "progress": {
            "stage": data.get("stage"),
            "stageStatus": data.get("stageStatus"),
        }})
    task.result_summary = summary
    await db.flush()


async def _handle_audit_status(db: AsyncSession, body: dict[str, Any]) -> None:
    task = await _find_task_by_operation(db, body)
    if task is None:
        return
    data = body.get("data") or {}
    sub_task_id = data.get("taskId")
    if not sub_task_id:
        return
    summary = list(task.result_summary or [])
    for item in summary:
        if item.get("subTaskId") == sub_task_id:
            item["audit"] = {
                "stage": data.get("stage"),
                "stageStatus": data.get("stageStatus"),
                "openUrl": data.get("openUrl"),
            }
            break
    task.result_summary = summary
    await db.flush()


async def _handle_account_status(
    db: AsyncSession, body: dict[str, Any], event: WebhookEvent | None = None
) -> None:
    data = body.get("data") or {}
    lapi_account_id = data.get("accountId") or data.get("id")
    if not lapi_account_id:
        return
    new_status = (data.get("status") or "").lower()
    if new_status not in ("active", "expired", "revoked"):
        return
    acc = (await db.execute(
        select(LapiAccount).where(LapiAccount.lapi_account_id == lapi_account_id)
    )).scalar_one_or_none()
    if acc is None:
        return
    # revoked 是网关主动软删（去重/不活跃回收/解绑）后的终态：灵径随后推来的 accountStatus 多为
    # 我们自己 revoke 的回声，不得再改会话状态、更不得投影覆盖 media（如把回收标的 expired 盖成 revoked）
    prev_status = acc.status
    if prev_status != "revoked":
        acc.status = new_status
        acc.last_sync_at = datetime.utcnow()
    # 若该会话是其稳定账号的当前会话，投影状态到 media；并把转发 body 的 id 改写为 acc_xxx
    if acc.media_account_id is not None:
        media = (await db.execute(
            select(MediaAccount).where(MediaAccount.id == acc.media_account_id)
        )).scalar_one_or_none()
        if media is not None:
            if prev_status != "revoked" and media.current_lapi_account_id == lapi_account_id:
                media.status = new_status
                media.last_sync_at = datetime.utcnow()
            _rewrite_forward_id(event, lapi_account_id, media.account_id)
    await db.flush()


async def _handle_account_overview(
    db: AsyncSession, body: dict[str, Any], event: WebhookEvent | None = None
) -> None:
    data = body.get("data") or {}
    lapi_account_id = data.get("accountId") or data.get("id")
    if not lapi_account_id:
        return
    overview = data.get("overview") or data
    today = datetime.utcnow().date()
    # 指标按稳定 acc_xxx 归集（AccountMetric.lapi_account_id 现存 acc_xxx）；并改写转发 body
    media = await resolve_media_account(db, lapi_account_id)
    if media is not None:
        lapi_account_id = media.account_id
        media.last_sync_at = datetime.utcnow()
        _rewrite_forward_id(event, data.get("accountId") or data.get("id"), media.account_id)
    existing = (await db.execute(
        select(AccountMetric)
        .where(AccountMetric.lapi_account_id == lapi_account_id)
        .where(AccountMetric.snapshot_date == today)
    )).scalar_one_or_none()
    if existing is None:
        existing = AccountMetric(
            lapi_account_id=lapi_account_id,
            snapshot_date=today,
            followers=int(overview.get("followers") or 0),
            works_count=int(overview.get("worksCount") or overview.get("works_count") or 0),
            total_likes=int(overview.get("totalLikes") or overview.get("total_likes") or 0),
            total_views=int(overview.get("totalViews") or overview.get("total_views") or 0),
            raw=overview,
        )
        db.add(existing)
    else:
        existing.followers = int(overview.get("followers") or existing.followers)
        existing.works_count = int(overview.get("worksCount") or existing.works_count)
        existing.total_likes = int(overview.get("totalLikes") or existing.total_likes)
        existing.total_views = int(overview.get("totalViews") or existing.total_views)
        existing.raw = overview
    await db.flush()
