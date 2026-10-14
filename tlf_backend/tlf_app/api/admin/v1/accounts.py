"""admin: 账号管理（稳定账号 MediaAccount 视图 + 租户绑定视图）。

底层账号视图以稳定账号（MediaAccount，一行=一个物理号）为主，灵径会话为其下细节。
"""
from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.config import settings
from tlf_app.core.database import get_db
from tlf_app.core.dependencies import AdminClaims, get_current_admin
from tlf_app.core.exceptions import BadRequestError, NotFoundError, UpstreamError
from tlf_app.models.developer_app import DeveloperApp
from tlf_app.models.lapi_account import LapiAccount
from tlf_app.models.media_account import MediaAccount
from tlf_app.models.proxy import Proxy
from tlf_app.models.tenant_account_binding import TenantAccountBinding
from tlf_app.schemas.admin import (
    LapiAccountAdminResponse,
    SetAccountProxyRequest,
    TenantBindingAdminResponse,
)
from tlf_app.schemas.common import ok
from tlf_app.services import lapi_client
from tlf_app.services.account_ops import count_active_bindings, hard_delete_media
from tlf_app.services.account_resolver import attach_session_to_media, resolve_media_account

router = APIRouter()

logger = logging.getLogger(__name__)


# ============ 稳定账号（去重）视图 ============

@router.get("/accounts/lapi/stats")
async def lapi_accounts_stats(
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """底层账号总览统计（不受列表过滤影响）。

    注意口径：`total` 是**去重后的物理账号数**（MediaAccount，一行=一个物理号）；
    `active_sessions` 是**本地灵径活跃会话数**（LapiAccount status=active）——对账基准：
    灵径后台「全量同步」返回的账号数应≈该值，若明显偏大说明灵径侧存在重复/无主会话，
    跑一次全量同步即可 revoke 对齐。
    """
    def _count_media(*conds):
        stmt = select(func.count()).select_from(MediaAccount)
        for c in conds:
            stmt = stmt.where(c)
        return stmt

    total = (await db.execute(_count_media())).scalar_one()
    by_provider_rows = (await db.execute(
        select(MediaAccount.provider, func.count()).group_by(MediaAccount.provider)
    )).all()
    by_status_rows = (await db.execute(
        select(MediaAccount.status, func.count()).group_by(MediaAccount.status)
    )).all()
    active_sessions = (await db.execute(
        select(func.count()).select_from(LapiAccount).where(LapiAccount.status == "active")
    )).scalar_one()
    active_bindings = (await db.execute(
        select(func.count()).select_from(TenantAccountBinding)
        .where(TenantAccountBinding.status == "active")
    )).scalar_one()
    by_provider = {str(p): int(c) for p, c in by_provider_rows}
    by_status = {str(s): int(c) for s, c in by_status_rows}
    return ok({
        "total": int(total),
        "provider_lapi": by_provider.get("lapi", 0),
        "provider_composio": by_provider.get("composio", 0),
        "status_active": by_status.get("active", 0),
        "status_expired": by_status.get("expired", 0),
        "status_revoked": by_status.get("revoked", 0),
        "active_sessions": int(active_sessions),
        "active_bindings": int(active_bindings),
    })


@router.get("/accounts/lapi", response_model=list[LapiAccountAdminResponse])
async def list_lapi_accounts(
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    platform_code: str | None = Query(None),
    status: str | None = Query(None),
    provider: str | None = Query(None, description="按上游过滤：lapi=灵径(国内) / composio=海外"),
    proxy_id: str | None = Query(None, description="按当前会话所用代理过滤"),
    search: str | None = Query(None, description="按昵称 / 平台用户 ID / acc_id 模糊搜索"),
):
    # 每个稳定账号绑定的租户数（按 account_id）
    cnt_subq = (
        select(
            TenantAccountBinding.account_id,
            func.count(TenantAccountBinding.id).label("binding_count"),
        )
        .where(TenantAccountBinding.status == "active")
        .group_by(TenantAccountBinding.account_id)
        .subquery()
    )
    # 联出「当前会话所用代理」：media.current_lapi_account_id → LapiAccount.proxy_id → Proxy
    stmt = (
        select(
            MediaAccount,
            func.coalesce(cnt_subq.c.binding_count, 0),
            Proxy.id, Proxy.name, Proxy.server_add, Proxy.server_port,
        )
        .outerjoin(cnt_subq, cnt_subq.c.account_id == MediaAccount.account_id)
        .outerjoin(LapiAccount, LapiAccount.lapi_account_id == MediaAccount.current_lapi_account_id)
        .outerjoin(Proxy, Proxy.id == LapiAccount.proxy_id)
        .order_by(MediaAccount.created_at.desc())
    )
    if platform_code:
        stmt = stmt.where(MediaAccount.platform_code == platform_code)
    if status:
        stmt = stmt.where(MediaAccount.status == status)
    if provider:
        stmt = stmt.where(MediaAccount.provider == provider)
    if proxy_id:
        stmt = stmt.where(LapiAccount.proxy_id == proxy_id)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(
            MediaAccount.platform_user_name.ilike(like),
            MediaAccount.platform_user_id.ilike(like),
            MediaAccount.account_id.ilike(like),
        ))
    rows = (await db.execute(stmt)).all()
    out: list[LapiAccountAdminResponse] = []
    for media, cnt, proxy_id, proxy_name, proxy_add, proxy_port in rows:
        out.append(LapiAccountAdminResponse(
            id=media.id,
            account_id=media.account_id,
            lapi_account_id=media.current_lapi_account_id,
            platform_code=media.platform_code,
            platform_user_id=media.platform_user_id,
            platform_user_name=media.platform_user_name,
            platform_avatar=media.platform_avatar,
            platform_home_url=media.platform_home_url,
            status=media.status,
            provider=media.provider,
            proxy_id=str(proxy_id) if proxy_id else None,
            proxy_name=proxy_name,
            proxy_server=f"{proxy_add}:{proxy_port}" if proxy_add else None,
            proxy_region=media.proxy_region,
            last_authed_at=media.last_authed_at,
            last_sync_at=media.last_sync_at,
            binding_count=int(cnt),
            created_at=media.created_at,
            updated_at=media.updated_at,
        ))
    return out


@router.post("/accounts/lapi/{account_id}/sync")
async def sync_lapi_account(
    account_id: str,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """同步稳定账号：灵径账号刷当前会话状态；Composio 账号按连接刷昵称 / 头像 / 主页并回填用户 id。"""
    media = await resolve_media_account(db, account_id)
    if media is None:
        raise NotFoundError("账号不存在")
    if media.provider == "composio":
        if not media.provider_account_ref:
            raise NotFoundError("账号无可用海外连接，需重新授权")
        from tlf_app.services.composio_account import refresh_composio_media
        conn = await refresh_composio_media(db, media)
        await db.commit()
        return ok({
            "synced": True, "status": media.status,
            "platform_user_id": media.platform_user_id,
            "platform_user_name": media.platform_user_name,
            "platform_avatar": media.platform_avatar,
            "identity_resolved": bool(conn.get("platform_user_id")),
        })
    if not media.current_lapi_account_id:
        raise NotFoundError("账号无可用底层会话")
    acc = (await db.execute(
        select(LapiAccount).where(LapiAccount.lapi_account_id == media.current_lapi_account_id)
    )).scalar_one_or_none()
    # 当前会话已被回收/撤销（如不活跃自动回收）：灵径侧已删，上游查询必失败，短路返回
    if acc is not None and acc.status == "revoked":
        return ok({"synced": False, "status": media.status,
                   "note": "当前会话已在灵径侧回收/撤销，需重新扫码授权后才有新会话"})
    try:
        remote = await lapi_client.get_remote_account(media.current_lapi_account_id)
    except UpstreamError as exc:
        raise exc
    name = remote.get("platformUserName")
    avatar = remote.get("platformAvatar")
    remote_status = str(remote.get("status") or "").lower()
    if acc is not None:
        acc.platform_user_name = name or acc.platform_user_name
        acc.platform_avatar = avatar or acc.platform_avatar
        if remote_status in ("active", "expired", "revoked"):
            acc.status = remote_status
        acc.last_sync_at = datetime.utcnow()
    media.platform_user_name = name or media.platform_user_name
    media.platform_avatar = avatar or media.platform_avatar
    if remote_status in ("active", "expired", "revoked"):
        media.status = remote_status
    media.last_sync_at = datetime.utcnow()
    await db.commit()
    return ok({"synced": True, "status": media.status})


@router.post("/accounts/lapi/{account_id}/author-info")
async def debug_author_info(
    account_id: str,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """【调试】拉取该账号在灵径的「获取作者信息」原始返回（含 raw），用于核对各平台主页 id 字段名
    （如快手 web 主页所需的 eid 藏在 raw 里，字段名文档未展开）。best-effort：cookie 失效/上游报错
    时把错误信息一并返回，不抛 500。"""
    media = await resolve_media_account(db, account_id)
    if media is None or not media.current_lapi_account_id:
        raise NotFoundError("账号不存在或无可用底层会话")
    try:
        info = await lapi_client.get_author_info(media.current_lapi_account_id)
        return ok({"platform_code": media.platform_code, "author_info": info})
    except Exception as exc:  # noqa: BLE001
        logger.warning("[admin] 取作者信息失败 %s: %s", account_id, exc)
        return ok({
            "platform_code": media.platform_code, "author_info": None, "error": str(exc)[:500],
        })


@router.post("/accounts/lapi/{account_id}/proxy")
async def set_lapi_account_proxy(
    account_id: str,
    body: SetAccountProxyRequest,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """修改稳定账号当前会话所用代理（admin 手动指定）。

    proxy_id 指定 → 绑到该代理并清零其灵径侧失败计数（干净起点）；
    proxy_id=null → 解绑，下次操作时按用户粘性/负载均衡自动分配。
    """
    media = await resolve_media_account(db, account_id)
    if media is None or not media.current_lapi_account_id:
        raise NotFoundError("账号不存在或无可用底层会话")
    acc = (await db.execute(
        select(LapiAccount).where(LapiAccount.lapi_account_id == media.current_lapi_account_id)
    )).scalar_one_or_none()
    if acc is None:
        raise NotFoundError("账号无可用底层会话")

    proxy_name: str | None = None
    if body.proxy_id:
        proxy = (await db.execute(select(Proxy).where(Proxy.id == body.proxy_id))).scalar_one_or_none()
        if proxy is None:
            raise NotFoundError("代理不存在")
        acc.proxy_id = proxy.id
        proxy.upstream_fail_count = 0  # 手动换代理，给新代理一个干净起点
        proxy_name = proxy.name
    else:
        acc.proxy_id = None  # 解绑：下次自动分配
    await db.commit()
    return ok({"updated": True, "proxy_id": acc.proxy_id, "proxy_name": proxy_name})


@router.delete("/accounts/lapi/{account_id}")
async def delete_lapi_account(
    account_id: str,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """彻底删稳定账号：revoke 其下所有灵径会话 + 删会话/绑定/media + 释放代理。"""
    media = await resolve_media_account(db, account_id)
    if media is None:
        raise NotFoundError("账号不存在")
    # composio 账号无灵径会话，需额外解绑 Composio 侧连接（best-effort）
    if media.provider == "composio" and media.provider_account_ref:
        from tlf_app.services import composio_client
        await composio_client.delete_connection(media.provider_account_ref)
    removed = await hard_delete_media(db, media)
    await db.commit()
    return ok({"deleted": True, "removed_bindings": removed})


# ============ 租户绑定视图 ============

@router.get("/accounts/bindings", response_model=list[TenantBindingAdminResponse])
async def list_bindings(
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    app_id_filter: str | None = Query(None, description="按租户 app_id (对外可见) 过滤"),
):
    stmt = (
        select(TenantAccountBinding, DeveloperApp, MediaAccount)
        .join(DeveloperApp, DeveloperApp.id == TenantAccountBinding.app_id)
        .outerjoin(MediaAccount, MediaAccount.account_id == TenantAccountBinding.account_id)
        .order_by(TenantAccountBinding.created_at.desc())
    )
    if app_id_filter:
        stmt = stmt.where(DeveloperApp.app_id == app_id_filter)
    rows = (await db.execute(stmt)).all()
    out: list[TenantBindingAdminResponse] = []
    for binding, app, media in rows:
        out.append(TenantBindingAdminResponse(
            id=binding.id,
            app_id=app.app_id,
            app_name=app.name,
            account_id=binding.account_id,
            # 展示当前底层灵径会话 id（供 admin 对照灵径后台）；缺则回退遗留列
            lapi_account_id=(media.current_lapi_account_id if media else None) or binding.lapi_account_id,
            platform_code=media.platform_code if media else None,
            platform_user_name=media.platform_user_name if media else None,
            custom_label=binding.custom_label,
            status=binding.status,
            bound_at=binding.bound_at,
            created_at=binding.created_at,
        ))
    return out


@router.delete("/accounts/bindings/{binding_id}")
async def delete_binding(
    binding_id: str,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    binding = (await db.execute(
        select(TenantAccountBinding).where(TenantAccountBinding.id == binding_id)
    )).scalar_one_or_none()
    if binding is None:
        raise NotFoundError("绑定不存在")
    account_id = binding.account_id
    await db.delete(binding)
    await db.flush()

    # 还剩多少租户 active 绑着这个稳定账号
    other = (await db.execute(
        select(func.count())
        .select_from(TenantAccountBinding)
        .where(TenantAccountBinding.account_id == account_id)
        .where(TenantAccountBinding.status == "active")
    )).scalar_one()

    if other == 0 and account_id:
        media = (await db.execute(
            select(MediaAccount).where(MediaAccount.account_id == account_id)
        )).scalar_one_or_none()
        if media is not None:
            await hard_delete_media(db, media)
        await db.commit()
        return ok({"deleted": True, "remaining_bindings": 0, "lapi_revoked": True})

    await db.commit()
    return ok({"deleted": True, "remaining_bindings": int(other), "lapi_revoked": False})


# ============ 全量同步（admin 触发：拉灵径全部账号 → media 落账 + 绑给目标租户） ============

@router.post("/accounts/sync-all")
async def sync_all_accounts(
    default_app_id: str | None = Query(
        None, description="目标租户的对外可见 app_id；不传则只刷新底层账号、不建任何绑定"
    ),
    platform_code: str | None = Query(None, description="仅同步指定平台；不传=全部平台"),
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """从灵径拉全部账号，与推量发对齐：有租户认领的刷新落账；无人认领的灵径账号视为脏数据。

    - **`default_app_id` 不传（对齐模式）**：① 已被某租户绑定的账号 → 经 media 层落账刷新（去重软删旧会话）；
      ② **灵径有、推量发无人认领的账号 → 直接 revoke 释放（停止扣费），不导入**；③ 灵径侧已消失的本地 active 会话 → 标记 revoked。
    - **`default_app_id` 显式传（导入模式）**：admin 明确把全部灵径账号落账并绑给该租户（视作都认领）。
    """
    target_app = None
    if default_app_id:
        target_app = (await db.execute(
            select(DeveloperApp).where(DeveloperApp.app_id == default_app_id)
        )).scalar_one_or_none()
        if target_app is None:
            raise NotFoundError(f"租户 app_id={default_app_id} 不存在")

    try:
        remote = await lapi_client.list_remote_accounts(platform_code)
    except UpstreamError as exc:
        raise exc

    now = datetime.utcnow()
    synced_sessions = 0
    created_bindings = 0
    dirty_released = 0
    seen_remote_ids: set[str] = set()
    seen_accounts: set[str] = set()
    # 认领账号去重口径：落账触达的独立物理号（用于解释「灵径返回数 > 本地账号数」）
    claimed_account_ids: set[str] = set()

    for r in remote:
        lapi_account_id = str(r.get("id") or r.get("accountId") or "")
        if not lapi_account_id:
            continue
        seen_remote_ids.add(lapi_account_id)
        pc = str(r.get("platformCode") or platform_code or "")
        puid = str(r.get("platformUserId") or r.get("openId") or "")

        # 该物理号是否已被某租户认领？（已有稳定账号且有 active 绑定）
        media = (await db.execute(
            select(MediaAccount)
            .where(MediaAccount.platform_code == pc)
            .where(MediaAccount.platform_user_id == puid)
        )).scalar_one_or_none()
        has_binding = media is not None and (await count_active_bindings(db, media.account_id)) > 0

        if has_binding or target_app is not None:
            # 认领账号：落账刷新（+ 导入模式下绑定到目标租户）
            media = await attach_session_to_media(
                db,
                lapi_account_id=lapi_account_id,
                platform_code=pc,
                platform_user_id=puid,
                platform_user_name=r.get("platformUserName"),
                platform_avatar=r.get("platformAvatar"),
                now=now,
            )
            synced_sessions += 1
            claimed_account_ids.add(media.account_id)
            if target_app is not None and media.account_id not in seen_accounts:
                seen_accounts.add(media.account_id)
                binding = (await db.execute(
                    select(TenantAccountBinding)
                    .where(TenantAccountBinding.app_id == target_app.id)
                    .where(TenantAccountBinding.account_id == media.account_id)
                )).scalar_one_or_none()
                if binding is None:
                    db.add(TenantAccountBinding(
                        app_id=target_app.id,
                        account_id=media.account_id,
                        status="active",
                        bound_at=now,
                    ))
                    created_bindings += 1
                elif binding.status != "active":
                    binding.status = "active"
        else:
            # 脏数据：灵径有、推量发无人认领 → revoke 释放（停止扣费），不导入
            try:
                await lapi_client.revoke_remote_account(lapi_account_id)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[sync-all] 释放无主灵径账号 revoke 失败 %s：%s", lapi_account_id, exc)
            if media is not None:
                # 清掉遗留的 orphan 稳定账号（无绑定）+ 其会话；灵径已在上面 revoke，无需重复
                await hard_delete_media(db, media, revoke_upstream=False)
            dirty_released += 1

    # 标记灵径侧已消失的本地 active 会话为 revoked（认领账号的会话过期对齐）
    revoked_sessions = 0
    stale_stmt = select(LapiAccount).where(LapiAccount.status == "active")
    if platform_code:
        stale_stmt = stale_stmt.where(LapiAccount.platform_code == platform_code)
    for acc in (await db.execute(stale_stmt)).scalars().all():
        if acc.lapi_account_id not in seen_remote_ids:
            acc.status = "revoked"
            acc.last_sync_at = now
            revoked_sessions += 1
            if acc.media_account_id is not None:
                media = (await db.execute(
                    select(MediaAccount).where(MediaAccount.id == acc.media_account_id)
                )).scalar_one_or_none()
                if media is not None and media.current_lapi_account_id == acc.lapi_account_id:
                    media.status = "revoked"
                    media.last_sync_at = now

    await db.commit()
    return ok({
        "target_app_id": target_app.app_id if target_app is not None else None,
        "target_app_name": target_app.name if target_app is not None else None,
        "total_remote": len(remote),
        "synced_sessions": synced_sessions,
        # 去重后触达的独立物理账号数；merged = 同一物理号的重复灵径会话被合并（旧会话已 revoke）
        "distinct_accounts": len(claimed_account_ids),
        "merged_duplicates": synced_sessions - len(claimed_account_ids),
        "created_bindings": created_bindings,
        "dirty_released": dirty_released,
        "revoked_sessions": revoked_sessions,
    })


# ============ 不活跃账号回收（灵径按天扣费，长期不用的 revoke 止损） ============

@router.post("/accounts/reap-inactive")
async def reap_inactive(
    dry_run: bool = Query(True, description="true=仅预览会回收哪些账号，不实际执行"),
    days: int | None = Query(None, ge=1, description="不活跃天数阈值；不传用 .env 配置值"),
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """手动触发一轮不活跃账号回收（后台每 INACTIVE_REVOKE_INTERVAL_HOURS 小时也会自动跑）。

    回收 = 灵径侧 revoke 当前会话（停止按天扣费）+ 本地标 expired（下游账号仍显示、登录态为掉线，
    重新扫码即恢复，acc_xxx 不变）+ 给绑定租户推 accountStatus(expired) webhook。
    「活跃」= 发布/取分类/风控操作/重新授权；**不含**登录态轮询检查与触发指标采集（下游定时任务常态）。
    """
    from tlf_app.services.inactive_reaper import find_inactive_candidates, reap_inactive_accounts

    effective_days = days or settings.INACTIVE_ACCOUNT_REVOKE_DAYS
    if effective_days <= 0:
        raise BadRequestError("不活跃回收未启用（INACTIVE_ACCOUNT_REVOKE_DAYS=0）且未指定 days")
    if dry_run:
        candidates = await find_inactive_candidates(db, effective_days)
        return ok({"dry_run": True, "days": effective_days,
                   "candidates": candidates, "count": len(candidates)})
    result = await reap_inactive_accounts(db, effective_days)
    return ok({"dry_run": False, **result})
