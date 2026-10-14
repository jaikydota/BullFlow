"""稳定账号（MediaAccount）解析 + 会话挂载（去重核心）。

对外只认稳定 `account_id`（acc_xxx）。但过渡期/历史接入方手里可能还握着老的灵径会话 id，
故 `resolve_media_account` 同时接受两者：
  1. acc_xxx                → 直接命中 MediaAccount.account_id
  2. 老灵径会话 id（任意 status，含 revoked 保留行）→ 经 LapiAccount.media_account_id 找到 media
这样消费侧即便存了「已被 revoke 的灵径 id」也能解析回正确账号，根治「该账号未绑定到当前租户」。

`attach_session_to_media` 是授权/同步落账的统一入口（webhook authResult / SDK probe / admin
sync-all 共用）：找/建 media、把新灵径会话挂上去并置为 current、**软删该 media 下其它 active 会话**
（灵径侧 revoke 省钱、本地标 revoked 保留作别名），保证一个物理号灵径侧只留 1 条活跃会话。
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.models.lapi_account import LapiAccount
from tlf_app.models.media_account import MediaAccount
from tlf_app.services.account_ops import soft_revoke_session


def mint_account_id() -> str:
    """生成对外稳定账号 id（不透明、与灵径 id 无关）。"""
    return "acc_" + uuid.uuid4().hex


async def resolve_media_account(db: AsyncSession, token: str) -> MediaAccount | None:
    """把租户给的 token（acc_xxx 或老灵径会话 id）解析为 MediaAccount；解析不到返回 None。"""
    if not token:
        return None
    media = (await db.execute(
        select(MediaAccount).where(MediaAccount.account_id == token)
    )).scalar_one_or_none()
    if media is not None:
        return media
    # 回退：当作老灵径会话 id（含已 revoked 的保留行）→ 找其所属 media
    session = (await db.execute(
        select(LapiAccount).where(LapiAccount.lapi_account_id == token)
    )).scalar_one_or_none()
    if session is None or session.media_account_id is None:
        return None
    return (await db.execute(
        select(MediaAccount).where(MediaAccount.id == session.media_account_id)
    )).scalar_one_or_none()


async def attach_session_to_media(
    db: AsyncSession,
    *,
    lapi_account_id: str,
    platform_code: str,
    platform_user_id: str,
    platform_user_name: str | None = None,
    platform_avatar: str | None = None,
    now: datetime | None = None,
    proxy_id: str | None = None,
    proxy_region: str | None = None,
) -> MediaAccount:
    """把一条新灵径会话挂到（找到/新建的）稳定账号上，并软删旧会话。返回 MediaAccount。

    - media 按 (platform_code, platform_user_id) 唯一；不存在则新建 + 铸 acc_xxx。
    - upsert 会话行（按 lapi_account_id）→ 置 active、挂 media、补代理。
    - 软删该 media 下其它 active 会话（灵径 revoke + 本地 revoked + 释放代理）→ 灵径侧只留 1 条。
    - media.current_lapi_account_id 指向本次会话，刷新昵称/头像/时间。
    - `proxy_region` 非空时写入 media.proxy_region（本次授权终端用户选定的代理区域，覆盖旧值）。
    """
    now = now or datetime.utcnow()

    media = (await db.execute(
        select(MediaAccount)
        .where(MediaAccount.platform_code == platform_code)
        .where(MediaAccount.platform_user_id == platform_user_id)
    )).scalar_one_or_none()
    if media is None:
        media = MediaAccount(
            account_id=mint_account_id(),
            platform_code=platform_code,
            platform_user_id=platform_user_id,
            platform_user_name=platform_user_name,
            platform_avatar=platform_avatar,
            status="active",
            last_authed_at=now,
            last_sync_at=now,
            proxy_region=proxy_region or None,
        )
        db.add(media)
        await db.flush()
    elif proxy_region:
        # 已存在的账号：本次重新授权时用户重选了 region → 覆盖（含从无到有）
        media.proxy_region = proxy_region

    # upsert 会话
    session = (await db.execute(
        select(LapiAccount).where(LapiAccount.lapi_account_id == lapi_account_id)
    )).scalar_one_or_none()
    if session is None:
        session = LapiAccount(
            lapi_account_id=lapi_account_id,
            media_account_id=media.id,
            platform_code=platform_code,
            platform_user_id=platform_user_id,
            platform_user_name=platform_user_name,
            platform_avatar=platform_avatar,
            status="active",
            last_authed_at=now,
        )
        if proxy_id:
            session.proxy_id = proxy_id
        db.add(session)
    else:
        session.media_account_id = media.id
        session.status = "active"
        session.last_authed_at = now
        session.platform_user_name = platform_user_name or session.platform_user_name
        session.platform_avatar = platform_avatar or session.platform_avatar
        if proxy_id and session.proxy_id is None:
            session.proxy_id = proxy_id
    await db.flush()

    # 软删该 media 下其它 active 会话（保留最新这条，省灵径扣费）
    others = (await db.execute(
        select(LapiAccount)
        .where(LapiAccount.media_account_id == media.id)
        .where(LapiAccount.lapi_account_id != lapi_account_id)
        .where(LapiAccount.status == "active")
    )).scalars().all()
    for old in others:
        await soft_revoke_session(db, old.lapi_account_id)

    # 刷新 media 当前会话指针 + 展示字段
    media.current_lapi_account_id = lapi_account_id
    media.platform_user_name = platform_user_name or media.platform_user_name
    media.platform_avatar = platform_avatar or media.platform_avatar
    media.status = "active"
    media.last_authed_at = now
    media.last_sync_at = now
    await db.flush()
    return media
