"""Composio 账号落账：把一个已激活的连接落成稳定 MediaAccount + 绑定到子租户。

不走 `attach_session_to_media`（那是灵径的会话/去重/代理逻辑）。Composio 一个连接(connection)
= 一个稳定账号，没有「会话」概念，故直接 upsert MediaAccount(provider=composio)。
account_id(acc_xxx) 对外稳定不变；底层 connection_id 存 provider_account_ref。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import logging

from tlf_app.models.developer_app import DeveloperApp
from tlf_app.models.media_account import MediaAccount
from tlf_app.models.tenant_account_binding import TenantAccountBinding
from tlf_app.services import composio_client
from tlf_app.services.account_resolver import mint_account_id
from tlf_app.services.author_home_url import finalize_home_url

logger = logging.getLogger(__name__)


async def refresh_composio_media(db: AsyncSession, media: MediaAccount) -> dict:
    """按连接状态刷新一个 Composio 账号：昵称 / 头像 / 主页 / 状态，并**回填**落账时没拿到的平台用户 id。

    SDK `POST /accounts/{id}/sync` 与 admin 同步共用。落账时若身份接口失败（权限 / 计费 / 限流），
    `platform_user_id` 会退化成 external_user_id 或 connection_id 兜底值——此时去重键是错的，下次重新
    授权拿到真实 id 会另建一条账号。这里在身份可用时把真实 id 回填（仅当当前值是兜底值且无冲突）。
    返回 get_connection 的结果 dict；调用方负责 commit。
    """
    conn = await composio_client.get_connection(media.provider_account_ref)
    raw_status = (conn.get("status") or "").upper()
    now = datetime.utcnow()

    media.platform_user_name = conn.get("platform_user_name") or media.platform_user_name
    media.platform_avatar = conn.get("platform_avatar") or media.platform_avatar
    home_url, home_is_profile = finalize_home_url(media.platform_code, conn.get("platform_home_url"))
    if home_url:
        media.platform_home_url = home_url
        media.home_url_is_profile = home_is_profile
    if composio_client.is_connection_expired(raw_status):
        media.status = "expired"
    elif raw_status == composio_client.STATUS_ACTIVE:
        media.status = "active"
    media.last_sync_at = now

    real_puid = str(conn.get("platform_user_id") or "").strip()
    if real_puid and real_puid != media.platform_user_id:
        # 当前值是不是兜底值：等于 connection_id，或等于该账号任一绑定的 external_user_id
        euids = set((await db.execute(
            select(TenantAccountBinding.external_user_id)
            .where(TenantAccountBinding.account_id == media.account_id)
        )).scalars().all())
        is_fallback = media.platform_user_id in euids or media.platform_user_id == media.provider_account_ref
        if is_fallback:
            clash = (await db.execute(
                select(MediaAccount.id)
                .where(MediaAccount.platform_code == media.platform_code)
                .where(MediaAccount.platform_user_id == real_puid)
                .where(MediaAccount.id != media.id)
            )).scalar_one_or_none()
            if clash is None:
                logger.info("[composio-sync] 回填平台用户 id account=%s %s → %s",
                            media.account_id, media.platform_user_id, real_puid)
                media.platform_user_id = real_puid
            else:
                logger.warning("[composio-sync] 真实 id %s 已被另一账号占用，跳过回填 account=%s",
                               real_puid, media.account_id)
    await db.flush()
    return conn


async def attach_composio_account(
    db: AsyncSession,
    *,
    app_ref: str | None,
    external_user_id: str | None,
    platform_code: str,
    connection_id: str,
    account_info: dict,
    now: datetime | None = None,
) -> MediaAccount:
    """upsert MediaAccount(provider=composio) 并绑定到子租户（app_ref=对外 app_xxx）。返回 media。

    media 按 (platform_code, platform_user_id) 唯一；platform_user_id 取连接里的平台用户标识，
    取不到用 connection_id 兜底。
    """
    now = now or datetime.utcnow()
    # 稳定去重键：海外连接 data 常拿不到平台真实 user id（如 LinkedIn OpenID 只给 token），
    # 故优先真实 id，否则用 external_user_id（同一终端用户同平台=一个账号；重新授权换了
    # connection_id 也不会重复建账号），最后才兜底 connection_id。
    puid = str(account_info.get("platform_user_id") or external_user_id or connection_id)

    media = (await db.execute(
        select(MediaAccount)
        .where(MediaAccount.platform_code == platform_code)
        .where(MediaAccount.platform_user_id == puid)
    )).scalar_one_or_none()
    # 主页收敛：有用户主页(如 Reddit/Facebook/YouTube/Instagram)用它=True；拿不到(如 LinkedIn)退平台
    # 站点首页=False。兜底在网关内完成，下游不再兜底。
    home_url, home_is_profile = finalize_home_url(platform_code, account_info.get("platform_home_url"))
    if media is None:
        media = MediaAccount(
            account_id=mint_account_id(),
            platform_code=platform_code,
            platform_user_id=puid,
            platform_user_name=account_info.get("platform_user_name"),
            platform_avatar=account_info.get("platform_avatar"),
            platform_home_url=home_url,
            home_url_is_profile=home_is_profile,
            provider="composio",
            provider_account_ref=connection_id,
            status="active",
            last_authed_at=now,
            last_sync_at=now,
        )
        db.add(media)
        await db.flush()
    else:
        media.provider = "composio"
        media.provider_account_ref = connection_id
        media.platform_user_name = account_info.get("platform_user_name") or media.platform_user_name
        media.platform_avatar = account_info.get("platform_avatar") or media.platform_avatar
        media.platform_home_url = home_url or media.platform_home_url
        media.home_url_is_profile = home_is_profile
        media.status = "active"
        media.last_authed_at = now
        media.last_sync_at = now
        await db.flush()

    # 绑定到发起授权的子租户
    if app_ref:
        app = (await db.execute(
            select(DeveloperApp).where(DeveloperApp.app_id == app_ref)
        )).scalar_one_or_none()
        if app is not None:
            binding = (await db.execute(
                select(TenantAccountBinding)
                .where(TenantAccountBinding.app_id == app.id)
                .where(TenantAccountBinding.account_id == media.account_id)
            )).scalar_one_or_none()
            if binding is None:
                db.add(TenantAccountBinding(
                    app_id=app.id,
                    account_id=media.account_id,
                    external_user_id=external_user_id,
                    status="active",
                    bound_at=now,
                ))
            else:
                binding.status = "active"
                if external_user_id and not binding.external_user_id:
                    binding.external_user_id = external_user_id
            await db.flush()
    return media
