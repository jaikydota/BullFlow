"""底层账号/会话生命周期操作（admin / sdk / webhook 共用）。

两类删除：
- **软删会话 `soft_revoke_session`**：去重时用——灵径侧 revoke（停止扣费）+ 本地标 `revoked`
  **保留行作别名历史**（老灵径 id → media 的解析依赖它）+ 释放代理。
- **硬删稳定账号 `hard_delete_media`**：admin 彻底删除 / 最后一个租户解绑时用——revoke 该 media
  下所有灵径会话 + 删会话行 + 删绑定 + 删 media + 释放代理。
"""
from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.models.lapi_account import LapiAccount
from tlf_app.models.media_account import MediaAccount
from tlf_app.models.tenant_account_binding import TenantAccountBinding
from tlf_app.services import lapi_client
from tlf_app.services.proxy_service import release_proxy_for_account

logger = logging.getLogger(__name__)


async def soft_revoke_session(db: AsyncSession, lapi_account_id: str) -> None:
    """软删一条灵径会话：灵径 revoke（best-effort）+ 本地标 revoked（保留行作别名）+ 释放代理。

    用于去重——同一物理号灵径侧只留 1 条 active 会话，旧会话停止扣费但本地保留映射。
    """
    try:
        await lapi_client.revoke_remote_account(lapi_account_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("灵径 revoke 失败 lapi_account_id=%s：%s（继续标记 revoked）", lapi_account_id, exc)

    await release_proxy_for_account(db, lapi_account_id)

    acc = (await db.execute(
        select(LapiAccount).where(LapiAccount.lapi_account_id == lapi_account_id)
    )).scalar_one_or_none()
    if acc is not None:
        acc.status = "revoked"
        acc.last_sync_at = datetime.utcnow()
    await db.flush()
    logger.info("[account-ops] 软删灵径会话 %s（标 revoked，保留作别名）", lapi_account_id)


async def mark_session_expired(db: AsyncSession, lapi_account_id: str) -> None:
    """检测到某会话登录态失效（cookie 过期）：标 LapiAccount + 其当前 MediaAccount 为 expired。

    与 soft_revoke_session 不同：**不 revoke 灵径侧**（用户重新扫码即可恢复同一物理号），
    只把状态投影成 expired，供前端/admin 展示「登录过期」并引导重新授权。仅 active→expired，
    不覆盖 revoked。
    """
    acc = (await db.execute(
        select(LapiAccount).where(LapiAccount.lapi_account_id == lapi_account_id)
    )).scalar_one_or_none()
    if acc is not None and acc.status == "active":
        acc.status = "expired"
        acc.last_sync_at = datetime.utcnow()
    media = (await db.execute(
        select(MediaAccount).where(MediaAccount.current_lapi_account_id == lapi_account_id)
    )).scalar_one_or_none()
    if media is not None and media.status == "active":
        media.status = "expired"
        media.last_sync_at = datetime.utcnow()
    await db.flush()
    logger.info("[account-ops] 标记会话登录态失效 expired lapi_account_id=%s", lapi_account_id)


async def hard_delete_media(db: AsyncSession, media: MediaAccount, *, revoke_upstream: bool = True) -> int:
    """彻底删除一个稳定账号：revoke 其下所有灵径会话 + 删会话/绑定/media + 释放代理。

    返回删除的绑定数。调用方负责 commit。用于 admin「彻底删除」/「最后一个租户解绑」。
    `revoke_upstream=False`：跳过灵径 revoke（调用方已自行 revoke，或会话在灵径侧本就不存在），
    仅清本地行 + 释放代理。
    """
    sessions = (await db.execute(
        select(LapiAccount).where(LapiAccount.media_account_id == media.id)
    )).scalars().all()
    for s in sessions:
        if revoke_upstream:
            try:
                await lapi_client.revoke_remote_account(s.lapi_account_id)
            except Exception as exc:  # noqa: BLE001
                logger.warning("灵径 revoke 失败 lapi_account_id=%s：%s（继续删本地）", s.lapi_account_id, exc)
        await release_proxy_for_account(db, s.lapi_account_id)

    bindings = (await db.execute(
        select(TenantAccountBinding).where(TenantAccountBinding.account_id == media.account_id)
    )).scalars().all()
    for b in bindings:
        await db.delete(b)

    for s in sessions:
        await db.delete(s)
    await db.delete(media)
    await db.flush()
    return len(bindings)


async def count_active_bindings(db: AsyncSession, account_id: str) -> int:
    """该稳定账号（acc_xxx）当前还被多少租户 active 绑定。"""
    return int((await db.execute(
        select(func.count())
        .select_from(TenantAccountBinding)
        .where(TenantAccountBinding.account_id == account_id)
        .where(TenantAccountBinding.status == "active")
    )).scalar_one())
