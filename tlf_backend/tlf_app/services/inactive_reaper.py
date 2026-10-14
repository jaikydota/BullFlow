"""不活跃账号自动回收：灵径按会话按天扣费，长期不用或已掉线的账号持续扣费。

规则：超过 `INACTIVE_ACCOUNT_REVOKE_DAYS` 天「不活跃」的灵径账号 →
  1. 灵径侧 revoke 当前会话（停止扣费；复用 soft_revoke_session：本地会话标 revoked 保留作别名 + 释放代理）
  2. MediaAccount 标 **expired**（不是 revoked！下游账号仍显示、登录态检查返回掉线、发布被拦并提示
     重新授权；用户重新扫码后经 attach_session_to_media 挂新会话，acc_xxx 不变，自动恢复 active）
  3. 给每个 active 绑定租户构造合成 `accountStatus`(expired) webhook 并转发（复用 webhook_forward，
     data.id 为稳定 acc_xxx），让下游实时感知掉线，无需等下次轮询。

「活跃」判定 = max(last_used_at, last_authed_at)（NULL 回退 created_at）：
  - last_used_at：发布 / 取分类 / 风控操作时打戳（见 publish.py / metrics.py）
  - last_authed_at：扫码（重新）授权
  - **刻意不算使用的两类自动化操作**：① 登录态轮询检查（刷 last_sync_at，不刷 last_used_at）；
    ② 触发指标采集——下游普遍有「每日全量刷指标」定时任务，若计入则所有账号被每日续命、机制形同虚设

只回收 provider=lapi；Composio(海外) 无按天计费会话，不参与。
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.config import settings
from tlf_app.core.database import async_session_factory
from tlf_app.core.log_context import set_request_id
from tlf_app.models.lapi_account import LapiAccount
from tlf_app.models.media_account import MediaAccount
from tlf_app.models.tenant_account_binding import TenantAccountBinding
from tlf_app.models.webhook_event import WebhookEvent
from tlf_app.services.account_ops import soft_revoke_session
from tlf_app.services.webhook_forward import forward_event

logger = logging.getLogger(__name__)

# 后台转发任务强引用（防 GC 提前回收 task）
_bg_tasks: set[asyncio.Task] = set()


def _spawn_forward(event_id: str) -> None:
    task = asyncio.create_task(forward_event(event_id))
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)


def _activity_expr():
    """活跃时间 SQL 表达式：max(last_used_at, last_authed_at)，NULL 各自回退 created_at。"""
    return func.greatest(
        func.coalesce(MediaAccount.last_used_at, MediaAccount.created_at),
        func.coalesce(MediaAccount.last_authed_at, MediaAccount.created_at),
    )


async def find_inactive_candidates(db: AsyncSession, days: int) -> list[dict]:
    """列出「超过 days 天不活跃、当前会话仍在灵径侧计费」的灵径账号（dry-run 预览用）。"""
    cutoff = datetime.utcnow() - timedelta(days=days)
    activity = _activity_expr()
    rows = (await db.execute(
        select(MediaAccount, activity.label("last_active_at"))
        .join(LapiAccount, LapiAccount.lapi_account_id == MediaAccount.current_lapi_account_id)
        .where(MediaAccount.provider == "lapi")
        .where(MediaAccount.status != "revoked")
        .where(MediaAccount.current_lapi_account_id.is_not(None))
        .where(LapiAccount.status != "revoked")   # 已 revoke 的会话不再计费，无需重复回收
        .where(activity < cutoff)
        .order_by(activity.asc())
    )).all()
    now = datetime.utcnow()
    return [
        {
            "account_id": m.account_id,
            "platform_code": m.platform_code,
            "platform_user_name": m.platform_user_name,
            "platform_user_id": m.platform_user_id,
            "status": m.status,
            "lapi_account_id": m.current_lapi_account_id,
            "last_active_at": last_active.isoformat() if last_active else None,
            "inactive_days": (now - last_active).days if last_active else None,
        }
        for m, last_active in rows
    ]


async def _emit_expired_webhooks(db: AsyncSession, media: MediaAccount, inactive_days: int | None) -> list[str]:
    """给该账号的每个 active 绑定租户落一条合成 accountStatus(expired) 事件，返回事件 id 列表。

    调用方 commit 后再触发转发（forward_event 自开 session 读事件行）。
    """
    bindings = (await db.execute(
        select(TenantAccountBinding)
        .where(TenantAccountBinding.account_id == media.account_id)
        .where(TenantAccountBinding.status == "active")
    )).scalars().all()
    event_ids: list[str] = []
    for b in bindings:
        payload = {
            "event": "accountStatus",
            "data": {
                "id": media.account_id,          # 下游只认稳定 acc_xxx
                "status": "expired",
                "reason": "inactive_auto_revoked",  # 网关主动回收（非平台侧 cookie 过期）
                "inactiveDays": inactive_days,
            },
            "timestamp": int(time.time()),
        }
        event = WebhookEvent(
            app_id=b.app_id,
            lapi_event_type="accountStatus",
            raw_payload=payload,
            raw_body_text=json.dumps(payload, ensure_ascii=False),
            signature_ok=True,   # 网关自产事件，视同已验签
            forward_status="pending",
        )
        db.add(event)
        await db.flush()
        event_ids.append(str(event.id))
    return event_ids


async def reap_inactive_accounts(db: AsyncSession, days: int) -> dict:
    """执行一轮回收。逐账号 commit（revoke 是外呼，避免长事务；单账号失败不连坐）。"""
    candidates = await find_inactive_candidates(db, days)
    reaped: list[dict] = []
    failed: list[str] = []
    for c in candidates:
        try:
            media = (await db.execute(
                select(MediaAccount).where(MediaAccount.account_id == c["account_id"])
            )).scalar_one_or_none()
            if media is None or not media.current_lapi_account_id:
                continue
            # 灵径 revoke（best-effort，内部已容错）+ 本地会话标 revoked + 释放代理
            await soft_revoke_session(db, media.current_lapi_account_id)
            # 标 expired：下游账号仍在、显示掉线，重新扫码即恢复（acc_xxx 不变）
            if media.status != "revoked":
                media.status = "expired"
            media.last_sync_at = datetime.utcnow()
            event_ids = await _emit_expired_webhooks(db, media, c["inactive_days"])
            await db.commit()
            for eid in event_ids:
                _spawn_forward(eid)
            reaped.append(c)
            logger.info(
                "[inactive-reaper] 回收 %s(%s/%s) 不活跃 %s 天：灵径已 revoke，标 expired，通知 %d 个租户",
                c["account_id"], c["platform_code"], c["platform_user_name"],
                c["inactive_days"], len(event_ids),
            )
        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            failed.append(c["account_id"])
            logger.exception("[inactive-reaper] 回收 %s 失败：%s", c["account_id"], exc)
    return {"days": days, "candidates": len(candidates), "reaped": reaped, "failed": failed}


async def reaper_loop() -> None:
    """常驻周期任务：每 INACTIVE_REVOKE_INTERVAL_HOURS 小时回收一轮。由 app lifespan 启动。"""
    days = settings.INACTIVE_ACCOUNT_REVOKE_DAYS
    interval = max(1, settings.INACTIVE_REVOKE_INTERVAL_HOURS) * 3600
    logger.info("[inactive-reaper] 不活跃账号自动回收已启动：>%d 天不活跃即 revoke，巡检间隔 %dh",
                days, interval // 3600)
    while True:
        try:
            set_request_id("reaper")
            async with async_session_factory() as db:
                result = await reap_inactive_accounts(db, days)
            if result["reaped"] or result["failed"]:
                logger.info("[inactive-reaper] 本轮回收 %d 个，失败 %d 个",
                            len(result["reaped"]), len(result["failed"]))
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("[inactive-reaper] 巡检异常：%s", exc)
        await asyncio.sleep(interval)


__all__ = ["find_inactive_candidates", "reap_inactive_accounts", "reaper_loop"]
