"""SDK 账号视图：列出该租户已绑账号 / 同步单账号 / 删除该租户的 mapping。

对外只暴露稳定 `account_id`（acc_xxx）。路径参数兼容老灵径会话 id（经 resolver 解析）。
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.config import settings
from tlf_app.core.database import async_session_factory, get_db
from tlf_app.core.dependencies import get_current_app
from tlf_app.core.exceptions import AppException, BadRequestError, ForbiddenError, NotFoundError
from tlf_app.models.developer_app import DeveloperApp
from tlf_app.models.lapi_account import LapiAccount
from tlf_app.models.media_account import MediaAccount
from tlf_app.models.tenant_account_binding import TenantAccountBinding
from tlf_app.schemas.common import ok
from tlf_app.schemas.sdk import AccountResponse
from tlf_app.services import composio_client, lapi_client
from tlf_app.services.account_ops import count_active_bindings, hard_delete_media
from tlf_app.services.account_resolver import resolve_media_account
from tlf_app.services.composio_account import refresh_composio_media
from tlf_app.services.lapi_account_op import lapi_account_op
from tlf_app.services.proxy_service import ensure_account_proxy

logger = logging.getLogger(__name__)

router = APIRouter()


def _media_to_response(
    media: MediaAccount, custom_label: str | None = None, *, login_check: str | None = None,
) -> AccountResponse:
    return AccountResponse(
        id=media.id,
        account_id=media.account_id,
        platform_code=media.platform_code,
        platform_user_id=media.platform_user_id,
        platform_user_name=media.platform_user_name,
        platform_avatar=media.platform_avatar,
        platform_home_url=media.platform_home_url,
        home_url_is_profile=media.home_url_is_profile,
        proxy_region=media.proxy_region,
        status=media.status,
        login_check=login_check,  # 仅 sync 传入本次登录检测结果；其它接口默认 None
        custom_label=custom_label,
        last_authed_at=media.last_authed_at,
        last_sync_at=media.last_sync_at,
    )


async def _require_bound_media(db: AsyncSession, app_id: str, token: str) -> tuple[MediaAccount, TenantAccountBinding]:
    """解析 token（acc_xxx 或老灵径 id）→ media，并校验已 active 绑定到当前租户。"""
    media = await resolve_media_account(db, token)
    if media is None:
        raise NotFoundError("账号不存在")
    binding = (await db.execute(
        select(TenantAccountBinding)
        .where(TenantAccountBinding.app_id == app_id)
        .where(TenantAccountBinding.account_id == media.account_id)
        .where(TenantAccountBinding.status == "active")
    )).scalar_one_or_none()
    if binding is None:
        raise ForbiddenError("该账号未绑定到当前租户")
    return media, binding


@router.get("/accounts", response_model=list[AccountResponse])
async def list_accounts(
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
    platform_code: str | None = Query(None),
    status: str | None = Query(None),
):
    """列出该租户已绑稳定账号，联表 MediaAccount + TenantAccountBinding。"""
    stmt = (
        select(MediaAccount, TenantAccountBinding)
        .join(
            TenantAccountBinding,
            and_(
                TenantAccountBinding.account_id == MediaAccount.account_id,
                TenantAccountBinding.app_id == current_app.id,
                TenantAccountBinding.status == "active",
            ),
        )
    )
    if platform_code:
        stmt = stmt.where(MediaAccount.platform_code == platform_code)
    if status:
        stmt = stmt.where(MediaAccount.status == status)
    rows = (await db.execute(stmt)).all()
    return [_media_to_response(media, binding.custom_label) for media, binding in rows]


@router.get("/accounts/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: str,
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
):
    """只读查询单个账号当前状态（纯本地，不调灵径）。账号必须已绑定到当前租户。"""
    media, binding = await _require_bound_media(db, current_app.id, account_id)
    return _media_to_response(media, binding.custom_label)


async def _run_account_sync(
    db: AsyncSession, media: MediaAccount, binding: TenantAccountBinding,
) -> AccountResponse:
    """同步一个账号：从上游拉最新状态/昵称/头像 → 更新 media → commit → 返回（按 provider 分流）。

    单账号同步(§4.3) 与批量同步(§4.3b) 共用。含灵径登录态检测（proxied，较慢），故批量有条数上限。
    """
    # 海外平台(Composio)：查连接状态刷新，无灵径会话概念
    if media.provider == "composio":
        if not media.provider_account_ref:
            raise NotFoundError("账号无可用连接，请重新授权")
        # 昵称 / 头像 / 主页 / 状态刷新 + 回填落账时没拿到的平台用户 id（与 admin 同步共用）
        await refresh_composio_media(db, media)
        await db.commit()
        await db.refresh(media)
        return _media_to_response(media, binding.custom_label)

    if not media.current_lapi_account_id:
        raise NotFoundError("账号无可用底层会话，请重新授权")
    lapi_id = media.current_lapi_account_id

    acc = (await db.execute(
        select(LapiAccount).where(LapiAccount.lapi_account_id == lapi_id)
    )).scalar_one_or_none()

    # 当前会话已被回收（如「不活跃自动回收」在灵径侧 revoke）：灵径侧账号已删，上游检测必失败，
    # 短路返回掉线结论，引导重新扫码（重扫后 attach 新会话，acc_xxx 不变，自动恢复）
    if acc is not None and acc.status == "revoked":
        if media.status == "active":
            media.status = "expired"
            media.last_sync_at = datetime.utcnow()
            await db.commit()
            await db.refresh(media)
        return _media_to_response(media, binding.custom_label, login_check="expired")

    # 1) 昵称/头像：/api/open/media-accounts/{id} 查（无代理；该接口**不含登录态字段**）
    remote = await lapi_client.get_remote_account(lapi_id)
    name = remote.get("platformUserName")
    avatar = remote.get("platformAvatar")

    # 2) 登录态：/api/open 不返回状态，走灵径专用「检测登录有效性」(/api/web/login-status-tasks，
    #    带账号代理)。loginStatus: 1=有效→active / 0=失效→expired / 其他(如 -1 检测异常，多为
    #    服务 IP 被平台风控临时限制)→保持原状不误判。业务错误(登录失效)/代理异常的置 expired /
    #    禁代理副作用由 lapi_account_op 统一处理；检测失败不阻断本次昵称/头像同步。
    # login_check = 本次检测结论回传下游：active/expired/error（检测异常，status 不动，下游自行提示）
    new_status: str | None = None
    login_check = "error"
    try:
        proxy = await ensure_account_proxy(db, lapi_id)
        async with lapi_account_op(db, lapi_id, proxy_op=True):
            detect = await lapi_client.check_login_status(lapi_id, proxy=proxy)
        login_status = detect.get("loginStatus")
        if login_status == 1:
            new_status = login_check = "active"
        elif login_status == 0:
            new_status = login_check = "expired"
        else:
            # -1 等异常（多为服务 IP 被平台风控临时限制）：不动 status，回传 error 让下游提示
            login_check = "error"
    except Exception as exc:  # noqa: BLE001
        # 网络/业务错误：登录失效/代理坏的副作用已由 lapi_account_op 处理；回传 error
        logger.info("[sync] 登录态检测失败 account=%s: %s", media.account_id, exc)
        login_check = "error"

    now = datetime.utcnow()
    if acc is not None:
        acc.platform_user_name = name or acc.platform_user_name
        acc.platform_avatar = avatar or acc.platform_avatar
        # 不复活 revoked（用户已解绑）；active↔expired 按检测结果双向更新
        if new_status and acc.status != "revoked":
            acc.status = new_status
        acc.last_sync_at = now
    media.platform_user_name = name or media.platform_user_name
    media.platform_avatar = avatar or media.platform_avatar
    if new_status and media.status != "revoked":
        media.status = new_status
    media.last_sync_at = now
    await db.commit()
    await db.refresh(media)
    return _media_to_response(media, binding.custom_label, login_check=login_check)


@router.post("/accounts/{account_id}/sync", response_model=AccountResponse)
async def sync_account(
    account_id: str,
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
):
    """同步单个账号：从上游拉最新状态/昵称/头像 → 更新 media → 返回（按 provider 分流）。"""
    media, binding = await _require_bound_media(db, current_app.id, account_id)
    return await _run_account_sync(db, media, binding)


class SyncBatchRequest(BaseModel):
    account_ids: list[str] = Field(..., description="要同步的 account_id 列表（acc_xxx）", min_length=1)


async def _sync_one_isolated(app_pk: int, account_id: str) -> dict:
    """批量同步用：**独立 session** 内同步一个账号，返回 AccountResponse dict。

    每账号独立 session + 独立 commit：一个失败不连坐其它。账号不存在/未绑定/上游异常都不抛，
    以 `{account_id, error}` 形式返回，让批量整体成功。
    """
    async with async_session_factory() as db:
        try:
            media, binding = await _require_bound_media(db, app_pk, account_id)
        except AppException as exc:
            return {"account_id": account_id, "status": "error", "error": getattr(exc, "message", str(exc))}
        try:
            resp = await _run_account_sync(db, media, binding)
            return resp.model_dump(mode="json")
        except Exception as exc:  # noqa: BLE001
            logger.info("[sync-batch] 同步 %s 失败：%s", account_id, exc)
            try:
                await db.rollback()
            except Exception:  # noqa: BLE001
                pass
            return {"account_id": account_id, "status": "error", "error": str(exc)[:300]}


@router.post("/accounts/sync-batch")
async def sync_accounts_batch(
    body: SyncBatchRequest,
    current_app: DeveloperApp = Depends(get_current_app),
):
    """批量同步多个账号（灵径无批量接口，网关内**逐账号并发**同步）。

    返回信封 `{code, message, data:[...]}`；data 每项为账号对象（同 §4.1 单条，且带本次登录检测
    结论 `login_check`），失败的账号项为 `{account_id, status:"error", error}`，不影响其它账号。
    条数上限 `SYNC_BATCH_MAX_ACCOUNTS`（防下游超时；每账号都要向灵径逐个检测登录态）。
    """
    ids = list(dict.fromkeys(body.account_ids))  # 去重保序
    limit = settings.SYNC_BATCH_MAX_ACCOUNTS
    if len(ids) > limit:
        raise BadRequestError(f"单次最多同步 {limit} 个账号，请分批")
    # 有界并发：既避免逐个串行超时，又不并发轰炸灵径
    sem = asyncio.Semaphore(min(len(ids), settings.SYNC_BATCH_CONCURRENCY))

    async def _guarded(aid: str) -> dict:
        async with sem:
            return await _sync_one_isolated(current_app.id, aid)

    results = await asyncio.gather(*[_guarded(a) for a in ids])
    return ok(list(results))


@router.delete("/accounts/{account_id}")
async def delete_account_binding(
    account_id: str,
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
):
    """仅删除当前租户的 mapping。若该稳定账号已无任何租户绑定 → 灵径侧 revoke 全部会话 + 删 media。"""
    media = await resolve_media_account(db, account_id)
    if media is None:
        raise NotFoundError("账号不存在")
    binding = (await db.execute(
        select(TenantAccountBinding)
        .where(TenantAccountBinding.app_id == current_app.id)
        .where(TenantAccountBinding.account_id == media.account_id)
    )).scalar_one_or_none()
    if binding is None:
        raise NotFoundError("该账号未绑定当前租户")
    await db.delete(binding)
    await db.flush()

    remaining = await count_active_bindings(db, media.account_id)
    if remaining == 0:
        # 海外平台：先删 Composio 侧连接，避免残留（灵径账号由 hard_delete_media 内 revoke）
        if media.provider == "composio" and media.provider_account_ref:
            await composio_client.delete_connection(media.provider_account_ref)
        await hard_delete_media(db, media)
        await db.commit()
        return ok({"unbound": True, "remaining_bindings": 0, "lapi_revoked": True})

    await db.commit()
    return ok({"unbound": True, "remaining_bindings": remaining, "lapi_revoked": False})
