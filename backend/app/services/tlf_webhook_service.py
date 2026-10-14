"""推量发 Webhook 验签 + 事件处理

验签（按官方「Webhook 集成与安全验证指南」）：
    expected = hmac_sha256(TLF_WEBHOOK_SECRET, f"{timestamp}.{raw_body}").hex()
    与 header `X-Webhook-Signature` 比对（hmac.compare_digest）

防重放：
    1) timestamp 超过 TLF_WEBHOOK_MAX_AGE 拒绝（默认 300s）
    2) Redis SETNX nonce 缓存（key=tlf:webhook:nonce:{signature}），TTL=MAX_AGE

事件分发：
    event=authResult        → 账号授权回调
    event=publishResult     → 发布结果（单子任务）
    event=publishProcess    → 发布进度（upload / push）
    event=auditStatus       → 平台审核进度
    event=accountStatus     → 账号状态变更
    event=accountOverview   → 账号概览数据
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import time
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.time import utcnow

from app.core.config import settings
from app.core.exceptions import AppException
from app.core.redis import get_redis
from app.models.tlf_account import TlfAccount
from app.models.tlf_account_metric import TlfAccountMetric
from app.models.tlf_distribution_task import TlfDistributionTask


async def _lock_task_for_update(db: AsyncSession, task_id: str) -> TlfDistributionTask | None:
    """加行级悲观锁后读取任务。

    同一任务在多 webhook 并发到达时（publishProcess / publishResult 等可能在数毫秒内
    串行抵达），通过 SELECT ... FOR UPDATE 串行化对 result_summary JSON 列的读改写，
    避免「后到的早 commit / 早到的晚 commit」造成的丢失更新。
    """
    result = await db.execute(
        select(TlfDistributionTask)
        .where(TlfDistributionTask.id == task_id)
        .with_for_update()
    )
    return result.scalar_one_or_none()


logger = logging.getLogger(__name__)


class WebhookVerifyError(AppException):
    def __init__(self, message: str = "Webhook 验签失败"):
        super().__init__(code=40100, message=message)


# ============ 验签 ============

def _resolve_webhook_secret() -> str:
    """推量发转发事件回主 backend 时用本租户的 webhook_secret（=TLF_WEBHOOK_SECRET）重签名。"""
    return settings.TLF_WEBHOOK_SECRET


def verify_signature(raw_body: bytes, timestamp: str | None, signature: str | None) -> None:
    """验签失败抛 WebhookVerifyError，并打详细日志便于排查。"""
    webhook_secret = _resolve_webhook_secret()
    if not webhook_secret:
        logger.error("[TLF-WH-SIGN] 失败：TLF_WEBHOOK_SECRET 未配置")
        raise WebhookVerifyError("webhook secret 未配置")
    if not timestamp or not signature:
        logger.warning(
            "[TLF-WH-SIGN] 失败：缺 header timestamp=%r signature=%r（应为 X-Webhook-Timestamp / X-Webhook-Signature）",
            timestamp, signature,
        )
        raise WebhookVerifyError("缺少 X-Webhook-Timestamp / X-Webhook-Signature 头")

    # 时间戳防重放
    try:
        ts = int(timestamp)
    except ValueError as exc:
        logger.warning("[TLF-WH-SIGN] 失败：X-Webhook-Timestamp 非整数 ts=%r", timestamp)
        raise WebhookVerifyError("X-Webhook-Timestamp 非整数") from exc
    now = int(time.time())
    if abs(now - ts) > settings.TLF_WEBHOOK_MAX_AGE:
        logger.warning(
            "[TLF-WH-SIGN] 失败：时间戳过期 now=%d ts=%d diff=%ds limit=%ds",
            now, ts, abs(now - ts), settings.TLF_WEBHOOK_MAX_AGE,
        )
        raise WebhookVerifyError(f"时间戳过期或超前（now={now} ts={ts}）")

    # HMAC-SHA256(secret, "{timestamp}.{raw_body}")
    msg = f"{timestamp}.".encode("utf-8") + raw_body
    expected = hmac.new(
        webhook_secret.encode("utf-8"),
        msg,
        hashlib.sha256,
    ).hexdigest()
    # 支持 sha256=xxx 或纯 hex 两种格式
    sig = signature.strip()
    if sig.startswith("sha256="):
        sig = sig[len("sha256="):]
    if not hmac.compare_digest(expected, sig):
        # 打印 secret 前 6 位 + 签名前后各 8 位辅助排查，避免泄密
        secret_preview = webhook_secret[:6] + "..."
        body_preview = raw_body[:200].decode("utf-8", errors="replace")
        logger.warning(
            "[TLF-WH-SIGN] 签名不匹配 ts=%s body_len=%d secret_pref=%s\n"
            "  expected=%s\n"
            "  received=%s\n"
            "  body_preview=%s",
            timestamp, len(raw_body), secret_preview, expected, sig, body_preview,
        )
        raise WebhookVerifyError("签名不匹配")


async def consume_nonce(signature: str) -> None:
    """同一签名 5 分钟内只能被消费一次，防回放攻击。"""
    redis = get_redis()
    key = f"{settings.TLF_REDIS_PREFIX}webhook:nonce:{signature}"
    ok = await redis.set(key, "1", ex=settings.TLF_WEBHOOK_MAX_AGE, nx=True)
    if not ok:
        raise WebhookVerifyError("重复的 Webhook 签名（疑似回放）")


# ============ 事件处理 ============

async def write_auth_op_status(
    operation_id: str,
    status: str,
    *,
    error_message: str | None = None,
    error_code: int | None = None,
    extra: dict | None = None,
) -> None:
    """把授权 operationId 当前状态写 Redis，前端轮询读这个判断 FAILED / SCAN 等中间态。

    key: tlf:auth-op:{operationId}  TTL 600s
    value: JSON {status, errorMessage?, errorCode?, ...}
    """
    import json as _json
    redis = get_redis()
    key = f"{settings.TLF_REDIS_PREFIX}auth-op:{operation_id}"
    payload: dict = {"status": status}
    if error_message is not None:
        payload["errorMessage"] = error_message
    if error_code is not None:
        payload["errorCode"] = error_code
    if extra:
        payload.update(extra)
    await redis.set(key, _json.dumps(payload), ex=600)


async def handle_auth_result(db: AsyncSession, event_data: dict) -> None:
    """授权结果回调：event=authResult。

    payload 结构（来自 plan 中提取的样例）：
    {
      "event": "authResult",
      "status": "SCAN" | "SUCCESS",
      "operationId": "...",
      "callBackData": { "user_id": "<our user.id>", "platform_code": "..." },
      "data": {
        "id": "<tlf_account_id>",
        "platformCode": "DouYin",
        "platformUserId": "...",
        "platformUserName": "...",
        "platformAvatar": "..."
      }
    }
    """
    status_str = (event_data.get("status") or "").upper()
    operation_id = event_data.get("operationId")

    # 中间态（SCAN）& 失败态（FAILED / FAIL）写 Redis 供前端轮询查看
    if operation_id and status_str in ("SCAN", "SCANNED", "FAILED", "FAIL"):
        await write_auth_op_status(
            operation_id,
            "scanned" if status_str in ("SCAN", "SCANNED") else "failed",
            error_message=event_data.get("errorMessage"),
            error_code=event_data.get("errorCode"),
            extra={"platformCode": event_data.get("platformCode")},
        )
        logger.info("[TLF-WH-AUTH] op=%s status=%s 写入 Redis", operation_id, status_str)

    if status_str != "SUCCESS":
        # 仅 SUCCESS 才落库账号
        logger.info("[TLF-WH-AUTH] 忽略非 SUCCESS 状态：%s", status_str)
        return

    cb = event_data.get("callBackData") or {}
    # 经推量发网关回流时，本地 user_id 放在 external_user_id（网关把它原样透传）；
    # 兼容历史直连时的 user_id 字段。
    user_id = cb.get("external_user_id") or cb.get("user_id")
    if not user_id:
        logger.warning("[TLF-WH-AUTH] callBackData 缺 external_user_id/user_id，无法关联本地用户")
        return

    data = event_data.get("data") or {}
    tlf_account_id = data.get("id")
    platform_code = data.get("platformCode") or cb.get("platform_code")
    platform_user_id = data.get("platformUserId")
    if not (tlf_account_id and platform_code and platform_user_id):
        logger.warning("[TLF-WH-AUTH] data 缺关键字段 id/platformCode/platformUserId")
        return

    # 同 user_id + platform + platform_user_id 已存在 → 更新；否则新建
    result = await db.execute(
        select(TlfAccount).where(
            TlfAccount.user_id == user_id,
            TlfAccount.platform_code == platform_code,
            TlfAccount.platform_user_id == platform_user_id,
        )
    )
    account = result.scalar_one_or_none()
    now = utcnow()
    if account is None:
        # 配额拦截：按平台区分国内 / 海外配额，实时 SUM 当前账号数，超过 套餐配额 + 加包名额 拒绝绑定
        from app.services.oversea_platforms import is_oversea_platform
        from app.services.saas_subscription import get_active_subscription
        from app.services.usage_aggregator import get_user_account_count
        sub = await get_active_subscription(db, user_id)
        if sub is not None:
            is_oversea = is_oversea_platform(platform_code)
            region = "overseas" if is_oversea else "domestic"
            current_count = await get_user_account_count(db, user_id, region)
            if is_oversea:
                total_quota = int(sub.overseas_accounts_quota or 0) + int(sub.addon_overseas_accounts or 0)
                label = "海外"
            else:
                total_quota = int(sub.domestic_accounts_quota or 0) + int(sub.addon_domestic_accounts or 0)
                label = "国内"
            if current_count >= total_quota:
                msg = (
                    f"{label}社媒账号数已达上限（{current_count}/{total_quota}），"
                    f"请升级套餐或购买账号加包"
                )
                logger.warning("[TLF-WH-AUTH] %s user=%s", msg, user_id)
                if operation_id:
                    await write_auth_op_status(
                        operation_id, "failed",
                        error_message=msg, error_code="QUOTA_EXCEEDED",
                        extra={"platformCode": platform_code},
                    )
                return

        account = TlfAccount(
            user_id=user_id,
            tlf_account_id=tlf_account_id,
            platform_code=platform_code,
            platform_user_id=platform_user_id,
            platform_user_name=data.get("platformUserName"),
            platform_avatar=data.get("platformAvatar"),
            platform_home_url=data.get("platformHomeUrl"),  # 网关授权时拼出并随 webhook 注入（用户主页或平台首页）
            home_url_is_profile=data.get("platformHomeUrlIsProfile"),  # true=用户主页 / false=平台首页
            status="active",
            last_authed_at=now,
            last_sync_at=now,
        )
        db.add(account)
        logger.info("[TLF-WH-AUTH] 新增账号 user=%s platform=%s", user_id, platform_code)
    else:
        account.tlf_account_id = tlf_account_id
        account.platform_user_name = data.get("platformUserName") or account.platform_user_name
        account.platform_avatar = data.get("platformAvatar") or account.platform_avatar
        account.platform_home_url = data.get("platformHomeUrl") or account.platform_home_url
        if data.get("platformHomeUrlIsProfile") is not None:
            account.home_url_is_profile = data.get("platformHomeUrlIsProfile")
        account.status = "active"
        account.last_authed_at = now
        account.last_sync_at = now
        logger.info("[TLF-WH-AUTH] 更新账号 id=%s user=%s", account.id, user_id)
    await db.flush()

    # 标记 op 为成功，前端轮询可立即跳成功页（不需要等本地账号 probe）
    if operation_id:
        await write_auth_op_status(
            operation_id,
            "success",
            extra={
                "platformCode": platform_code,
                "platformUserName": data.get("platformUserName"),
                "platformAvatar": data.get("platformAvatar"),
                "accountId": account.id,
            },
        )


async def handle_publish_result(db: AsyncSession, event_data: dict) -> None:
    """推送结果回调（每个子任务单独推送一次）。

    实际 payload（每子任务一条）：
    {
      "event": "publishResult",
      "publishType": "video|article|dynamic",
      "taskId": "<我们生成的 subTaskId>",
      "publishId": "<推量发生成的稿件 ID>",
      "stages": "push",
      "stageStatus": "success" | "fail",
      "errorMessage": "...",
      "callBackData": { "task_id": "<本地 TlfDistributionTask.id>", "user_id": "..." }
    }

    需要按 callBackData.task_id 找到本地任务，再用 taskId 在 account_snapshot 中
    匹配单账号子任务，更新 result_summary 该条；所有子任务到齐后落 task.status。
    """
    cb = event_data.get("callBackData") or {}
    task_id = cb.get("external_content_id") or cb.get("task_id")  # 网关回流：本地任务 ID 在 external_content_id
    sub_task_id = event_data.get("taskId")
    stage_status = (event_data.get("stageStatus") or "").lower()

    if not task_id or not sub_task_id:
        logger.warning("[TLF-WH-PUB-RESULT] 缺 callBackData.task_id / taskId，忽略：%s", event_data)
        return

    task = await _lock_task_for_update(db, task_id)
    if task is None:
        logger.warning("[TLF-WH-PUB-RESULT] 未找到本地任务 task_id=%s", task_id)
        return

    snapshot = list(task.account_snapshot or [])
    # 找到对应子任务在 snapshot 中的索引
    matched_idx = next(
        (i for i, e in enumerate(snapshot)
         if isinstance(e, dict) and e.get("subTaskId") == sub_task_id),
        None,
    )
    account_id = snapshot[matched_idx].get("id") if matched_idx is not None else None
    tlf_account_id = snapshot[matched_idx].get("tlfAccountId") if matched_idx is not None else None

    # 维护 result_summary（按子任务追加 / 更新）
    summary = list(task.result_summary or [])
    existing = next((r for r in summary if isinstance(r, dict) and r.get("subTaskId") == sub_task_id), None)
    entry = {
        "subTaskId": sub_task_id,
        "accountId": account_id,
        "tlfAccountId": tlf_account_id,
        "status": "success" if stage_status == "success" else "failed",
        "publishId": event_data.get("publishId"),
        "errorMessage": event_data.get("errorMessage"),
    }
    if existing is not None:
        existing.update(entry)
    else:
        summary.append(entry)
    task.result_summary = summary

    # 重新统计 success / failed / 终态
    s_count = sum(1 for r in summary if r.get("status") == "success")
    f_count = sum(1 for r in summary if r.get("status") == "failed")
    task.success_count = s_count
    task.failed_count = f_count
    done = s_count + f_count
    if done >= (task.total_count or len(snapshot) or 1):
        if f_count == 0 and s_count > 0:
            task.status = "success"
        elif s_count == 0 and f_count > 0:
            task.status = "failed"
            task.error_message = "; ".join(
                r.get("errorMessage", "") for r in summary if r.get("errorMessage")
            )[:1000] or None
        else:
            task.status = "partial"
    else:
        task.status = "publishing"

    logger.info(
        "[TLF-WH-PUB-RESULT] task=%s sub=%s status=%s | 累计 %d/%d (%d ok / %d fail)",
        task.id, sub_task_id, stage_status, done, task.total_count, s_count, f_count,
    )
    # JSON 列嵌套 dict 修改需显式标脏，否则 SQLAlchemy 可能不 emit UPDATE
    flag_modified(task, "result_summary")
    await db.flush()

    # 进入终态时发通知（幂等：同 task_id 1 天内只发一次）
    if task.status in ("success", "failed", "partial"):
        from app.services.notification_service import (
            create_notification,
            has_recent_notification,
        )
        already = await has_recent_notification(
            db,
            user_id=str(task.user_id),
            type=f"distribution.{task.status}" if task.status != "success" else "distribution.published",
            extra_key="task_id",
            extra_value=str(task.id),
            within_days=1,
        )
        if not already:
            if task.status == "success":
                ntype = "distribution.published"
                ntitle = "分发任务已完成"
                nmsg = f"{s_count} 个账号已成功发布"
            elif task.status == "failed":
                ntype = "distribution.failed"
                ntitle = "分发任务失败"
                nmsg = (task.error_message or "请检查账号状态")[:200]
            else:  # partial
                ntype = "distribution.failed"
                ntitle = "分发任务部分失败"
                nmsg = f"成功 {s_count} 个 / 失败 {f_count} 个"
            await create_notification(
                db,
                user_id=str(task.user_id),
                type=ntype,
                title=ntitle,
                message=nmsg,
                link_url=f"/tlf/tasks/{task.id}",
                extra={"task_id": str(task.id), "platform_code": task.platform_code},
            )


async def handle_publish_progress(db: AsyncSession, event_data: dict) -> None:
    """推送进度回调（upload / push 阶段实时进度）。

    payload:
    {
      "event": "publishProcess",
      "publishType": "video",
      "taskId": "<subTaskId>",
      "stages": "upload" | "push",
      "stageStatus": "doing" | "success" | "fail",
      "errorMessage": "...",
      "totalParts": N,
      "uploadedParts": N,
      "callBackData": { "task_id": "..." }
    }

    本地仅把进度信息塞进 result_summary 对应条目（便于前端展示），
    不变更整任务 status（status 由 publishResult 终态决定）。

    例外：进度阶段就 `stageStatus=fail`（如「视频下载失败」发生在 upload 阶段）= 该账号
    终态失败，且上游此种情况**通常不会再补发 publishResult** —— 必须按终态失败处理，
    否则任务会一直卡「发布中」直到 1 小时超时兜底。直接委托给 publishResult 终态逻辑。
    """
    cb = event_data.get("callBackData") or {}
    task_id = cb.get("external_content_id") or cb.get("task_id")  # 网关回流：本地任务 ID 在 external_content_id
    sub_task_id = event_data.get("taskId")
    if not task_id or not sub_task_id:
        return

    if (event_data.get("stageStatus") or "").lower() == "fail":
        logger.info(
            "[TLF-WH-PUB-PROGRESS] task=%s sub=%s 进度阶段失败(stage=%s)，按终态失败处理：%s",
            task_id, sub_task_id, event_data.get("stages"), event_data.get("errorMessage"),
        )
        await handle_publish_result(db, event_data)
        return

    task = await _lock_task_for_update(db, task_id)
    if task is None:
        return

    summary = list(task.result_summary or [])
    entry = next((r for r in summary if isinstance(r, dict) and r.get("subTaskId") == sub_task_id), None)

    # 终态保护：若 publishResult 已经把该子任务置为 success/failed，
    # 迟到的 publishProcess 不能再回写 progress（推量发偶尔乱序推送，会出现
    # 「最终态：失败」但 progress 仍是「上传/进行中」的脏数据）
    if entry is not None and entry.get("status") in ("success", "failed"):
        logger.info(
            "[TLF-WH-PUB-PROGRESS] task=%s sub=%s 已终态(%s)，丢弃迟到的进度事件 stage=%s/%s",
            task.id, sub_task_id, entry["status"],
            event_data.get("stages"), event_data.get("stageStatus"),
        )
        return

    progress = {
        "stage": event_data.get("stages"),
        "stageStatus": event_data.get("stageStatus"),
        "totalParts": event_data.get("totalParts"),
        "uploadedParts": event_data.get("uploadedParts"),
        "errorMessage": event_data.get("errorMessage"),
    }
    if entry is None:
        snapshot = task.account_snapshot or []
        matched = next((e for e in snapshot if isinstance(e, dict) and e.get("subTaskId") == sub_task_id), None)
        summary.append({
            "subTaskId": sub_task_id,
            "accountId": matched.get("id") if matched else None,
            "tlfAccountId": matched.get("tlfAccountId") if matched else None,
            "status": "publishing",
            "progress": progress,
        })
    else:
        entry["progress"] = progress
    task.result_summary = summary
    flag_modified(task, "result_summary")
    logger.info("[TLF-WH-PUB-PROGRESS] task=%s sub=%s stage=%s/%s parts=%s/%s",
                task.id, sub_task_id, progress.get("stage"), progress.get("stageStatus"),
                progress.get("uploadedParts"), progress.get("totalParts"))
    await db.flush()


async def handle_audit_status(db: AsyncSession, event_data: dict) -> None:
    """发布后审核进度回调（平台侧 review / transcoding / scheduled / success / notfound）。

    payload:
    {
      "event": "auditStatus",
      "accountId": "<tlf_account_id>",
      "publishId": "...",
      "documentId": "...",
      "openUrl": "...",
      "openUrls": [{ "title", "cover", "documentId", "openUrl" }, ...],
      "stages": "transcoding|review|scheduled|success|notfound",
      "stageStatus": "doing|success|fail",
      "errorMessage": "...",
      "callBackData": { ... }
    }
    """
    cb = event_data.get("callBackData") or {}
    task_id = cb.get("external_content_id") or cb.get("task_id")  # 网关回流：本地任务 ID 在 external_content_id
    publish_id = event_data.get("publishId")
    if not task_id:
        logger.info("[TLF-WH-AUDIT] 跳过：缺 callBackData.task_id（可能是历史发布的回调）")
        return

    task = await _lock_task_for_update(db, task_id)
    if task is None:
        return

    summary = list(task.result_summary or [])
    # 按 publishId 或 tlf_account_id 匹配
    entry = next(
        (r for r in summary
         if isinstance(r, dict) and (r.get("publishId") == publish_id
                                     or r.get("tlfAccountId") == event_data.get("accountId"))),
        None,
    )
    audit_info = {
        "stage": event_data.get("stages"),
        "stageStatus": event_data.get("stageStatus"),
        "openUrl": event_data.get("openUrl"),
        "openUrls": event_data.get("openUrls"),
        "errorMessage": event_data.get("errorMessage"),
    }
    if entry is None:
        summary.append({
            "publishId": publish_id,
            "tlfAccountId": event_data.get("accountId"),
            "audit": audit_info,
        })
    else:
        entry["audit"] = audit_info
        if event_data.get("openUrl"):
            entry["openUrl"] = event_data["openUrl"]
    task.result_summary = summary
    flag_modified(task, "result_summary")
    logger.info("[TLF-WH-AUDIT] task=%s account=%s stage=%s/%s url=%s",
                task.id, event_data.get("accountId"), audit_info.get("stage"),
                audit_info.get("stageStatus"), audit_info.get("openUrl"))
    await db.flush()


# ============ 数据采集回调 ============

# 平台 → 抽取 (followers, works, likes, views) 的字段映射
_OVERVIEW_FIELD_MAP: dict[str, dict[str, tuple[str, ...]]] = {
    "DouYin": {
        "followers": ("totalFansCount", "fansCount"),
        "works_count": ("worksCount", "totalWorksCount"),
        "total_likes": ("greatCount", "likeCount", "totalLikes"),
        "total_views": ("playCount", "totalPlayCount"),
    },
    "XiaoHongShu": {
        "followers": ("fansCount", "followerCount"),
        "works_count": ("noteCount", "worksCount"),
        "total_likes": ("likeCount", "totalLikes"),
        "total_views": ("viewCount", "readCount"),
    },
}
# 通用兜底键（按常见命名按顺序探查）
_OVERVIEW_FALLBACK = {
    "followers": ("followers", "fansCount", "followerCount", "totalFansCount"),
    "works_count": ("worksCount", "noteCount", "videoCount", "postsCount"),
    "total_likes": ("totalLikes", "likeCount", "greatCount"),
    "total_views": ("totalViews", "playCount", "viewCount", "readCount"),
}


def _pick_first(d: dict, keys: tuple[str, ...]) -> int:
    """按 keys 顺序在嵌套 dict 里找第一个非空整数。支持 d / d.overview / d.thirtydays.latest"""
    candidates: list[dict] = [d]
    for k in ("overview", "summary", "latest"):
        v = d.get(k)
        if isinstance(v, dict):
            candidates.append(v)
    for key in keys:
        for c in candidates:
            v = c.get(key)
            if isinstance(v, (int, float)):
                return int(v)
            if isinstance(v, str) and v.replace(",", "").isdigit():
                return int(v.replace(",", ""))
    return 0


async def handle_account_overview(db: AsyncSession, event_data: dict) -> None:
    """媒体号概览数据回调：写入 TlfAccountMetric 一行（按今日 upsert）。

    payload:
    {
      "event": "accountOverview",
      "accountId": "<tlf_account_id>",
      "callBackData": { ... },
      "overview": { ... 各平台不同结构 ... }
    }
    """
    from datetime import date as _date

    tlf_account_id = event_data.get("accountId")
    overview = event_data.get("overview")
    if not tlf_account_id or not isinstance(overview, dict):
        logger.warning("[TLF-WH-OVERVIEW] payload 缺 accountId / overview：%s", event_data)
        return

    # 通过 tlf_account_id 找本地账号
    acc_q = await db.execute(
        select(TlfAccount).where(TlfAccount.tlf_account_id == tlf_account_id)
    )
    account = acc_q.scalar_one_or_none()
    if account is None:
        logger.warning("[TLF-WH-OVERVIEW] 未找到本地账号 tlf_id=%s", tlf_account_id)
        return

    # 平台映射 + 兜底
    plat_map = _OVERVIEW_FIELD_MAP.get(account.platform_code, {})

    def _get(field: str) -> int:
        keys = plat_map.get(field) or _OVERVIEW_FALLBACK.get(field) or ()
        return _pick_first(overview, keys)

    followers = _get("followers")
    works = _get("works_count")
    likes = _get("total_likes")
    views = _get("total_views")

    today = _date.today()
    existing_q = await db.execute(
        select(TlfAccountMetric).where(
            TlfAccountMetric.tlf_account_id == account.id,
            TlfAccountMetric.snapshot_date == today,
        )
    )
    metric = existing_q.scalar_one_or_none()
    if metric is None:
        metric = TlfAccountMetric(
            user_id=account.user_id,
            tlf_account_id=account.id,
            snapshot_date=today,
            followers=followers,
            works_count=works,
            total_likes=likes,
            total_views=views,
            raw=overview,
        )
        db.add(metric)
    else:
        metric.followers = followers
        metric.works_count = works
        metric.total_likes = likes
        metric.total_views = views
        metric.raw = overview

    # 同步更新账号 last_sync_at
    account.last_sync_at = utcnow()
    logger.info(
        "[TLF-WH-OVERVIEW] account=%s 写入指标 followers=%d works=%d likes=%d views=%d",
        account.id, followers, works, likes, views,
    )
    await db.flush()


async def handle_account_status(db: AsyncSession, event_data: dict) -> None:
    """账号状态变更回调（过期 / 撤销）。

    payload:
    {
      "event": "accountStatus",
      "data": {"id": "<tlf_account_id>", "status": "expired" | "revoked"}
    }
    """
    data = event_data.get("data") or {}
    tlf_account_id = data.get("id")
    new_status_raw = (data.get("status") or "").lower()
    if not tlf_account_id:
        return
    mapped = {
        "expired": "expired",
        "revoked": "revoked",
        "active": "active",
    }.get(new_status_raw)
    if not mapped:
        logger.warning("[TLF-WH-STAT] 未识别状态 %s", new_status_raw)
        return

    result = await db.execute(
        select(TlfAccount).where(TlfAccount.tlf_account_id == tlf_account_id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        logger.warning("[TLF-WH-STAT] 未找到账号 tlf_id=%s", tlf_account_id)
        return
    account.status = mapped
    account.last_sync_at = utcnow()
    # reason=inactive_auto_revoked：网关「不活跃自动回收」（非平台侧登录过期）。仅日志区分，
    # 用户侧统一按「登录失效→重新授权」处理，不额外提示回收原因
    reason = data.get("reason")
    logger.info(
        "[TLF-WH-STAT] 账号 %s 状态 → %s%s",
        account.id, mapped, f"（reason={reason}）" if reason else "",
    )
    await db.flush()
