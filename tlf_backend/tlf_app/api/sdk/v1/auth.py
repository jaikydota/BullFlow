"""SDK 授权流程：扫码 / 状态轮询 / 主动同步。"""
from __future__ import annotations

import json
import logging
import time

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.config import settings
from tlf_app.core.database import get_db
from tlf_app.core.dependencies import get_current_app
from tlf_app.core.exceptions import BadRequestError, UpstreamError
from tlf_app.core.redis import get_redis
from tlf_app.models.developer_app import DeveloperApp
from tlf_app.schemas.common import ok
from tlf_app.schemas.sdk import (
    AuthStatusResponse,
    ProxyRegionsResponse,
    StartAuthorizationRequest,
    StartAuthorizationResponse,
)
from tlf_app.models.webhook_event import WebhookEvent
from tlf_app.services import composio_client, lapi_client
from tlf_app.services.composio_account import attach_composio_account
from tlf_app.services.platform_registry import provider_of, toolkit_of
from tlf_app.services.webhook_forward import forward_event
from tlf_app.services.proxy_service import (
    available_regions,
    get_user_last_region,
    pick_available_proxy,
)

logger = logging.getLogger(__name__)
router = APIRouter()


_COMPOSIO_CALLBACK_HTML = """<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>授权完成</title>
<style>
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
    background:#f6f5fc;color:#1f2937}
  .card{background:#fff;border:1px solid #ece9f5;border-radius:16px;padding:40px 48px;text-align:center;
    box-shadow:0 8px 30px rgba(124,58,237,.08)}
  .ok{width:56px;height:56px;border-radius:50%;background:#ecfdf5;color:#10b981;
    display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:30px}
  h1{font-size:18px;margin:0 0 8px}
  p{font-size:14px;color:#6b7280;margin:0}
</style></head>
<body><div class="card">
  <div class="ok">&#10003;</div>
  <h1>授权完成</h1>
  <p>您可以关闭本页面，返回原应用即可看到已绑定的账号。</p>
</div>
<script>setTimeout(function(){try{window.close()}catch(e){}},2500)</script>
</body></html>"""


@router.get("/auth/composio/callback", include_in_schema=False)
async def composio_callback(
    background_tasks: BackgroundTasks,
    status: str | None = None,
    connected_account_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """海外平台 OAuth 完成后浏览器回跳的提示页（无鉴权）。

    Composio 回跳时带 `?status=success&connected_account_id=ca_xxx`——这是**落账触发点**：
    用它落 MediaAccount + 构造 authResult 转发给子租户（下游（如本仓库 backend）据此落本地账号，
    前端轮询 listAccounts 即可见）。与灵径 webhook 转发同构。
    """
    if (status or "").lower() == "success" and connected_account_id:
        try:
            await _composio_finalize_connection(db, background_tasks, connected_account_id)
        except Exception as exc:  # noqa: BLE001
            # 回滚坏掉的事务，否则 get_db teardown 的 commit 会抛 PendingRollbackError → 500
            try:
                await db.rollback()
            except Exception:  # noqa: BLE001
                pass
            logger.warning("[composio-callback] 落账/转发失败 conn=%s: %s", connected_account_id, exc)
    return HTMLResponse(_COMPOSIO_CALLBACK_HTML)


async def _composio_finalize_connection(
    db: AsyncSession, background_tasks: BackgroundTasks, connection_id: str
) -> None:
    """连接已 ACTIVE → 落 MediaAccount + 转发 authResult 给子租户。可被 callback / webhook 复用。"""
    redis = get_redis()
    meta_raw = await redis.get(f"{settings.TLF_REDIS_PREFIX}composio-conn:{connection_id}")
    if not meta_raw:
        logger.info("[composio-callback] 无连接归属 meta conn=%s，跳过", connection_id)
        return
    meta = json.loads(meta_raw) if isinstance(meta_raw, str) else meta_raw

    conn = await composio_client.get_connection(connection_id)
    if (conn.get("status") or "").upper() != composio_client.STATUS_ACTIVE:
        logger.info("[composio-callback] 连接非 ACTIVE(%s) conn=%s，暂不落账", conn.get("status"), connection_id)
        return

    media = await attach_composio_account(
        db,
        app_ref=meta.get("app_id"),
        external_user_id=meta.get("external_user_id"),
        platform_code=meta.get("platform_code") or conn.get("toolkit") or "",
        connection_id=connection_id,
        account_info=conn,
    )
    await db.commit()

    # 构造 authResult 转发给子租户（与灵径 webhook 同构）→ 下游（如本仓库 backend）落本地账号 + 更新授权进度
    app = (await db.execute(
        select(DeveloperApp).where(DeveloperApp.app_id == meta.get("app_id"))
    )).scalar_one_or_none()
    if app is None or not app.webhook_url:
        logger.info("[composio-callback] 租户无 webhook_url，落账完成但不转发 account=%s", media.account_id)
        return
    body = {
        "type": "web",
        "data": {
            "event": "authResult",
            "status": "SUCCESS",
            "operationId": connection_id,
            "callBackData": {
                "app_id": meta.get("app_id"),
                "platform_code": media.platform_code,
                "external_user_id": meta.get("external_user_id"),
            },
            "data": {
                "id": media.account_id,
                "platformCode": media.platform_code,
                "platformUserId": media.platform_user_id,
                "platformUserName": media.platform_user_name,
                "platformAvatar": media.platform_avatar,
                "platformHomeUrl": media.platform_home_url,
                "platformHomeUrlIsProfile": media.home_url_is_profile,
            },
        },
    }
    event = WebhookEvent(
        app_id=app.id,
        lapi_event_type="authResult",
        raw_payload=body,
        raw_body_text=json.dumps(body, ensure_ascii=False),
        signature_ok=1,
        forward_status="pending",
        forward_attempts=0,
    )
    db.add(event)
    await db.commit()
    background_tasks.add_task(forward_event, event.id)
    logger.info("[composio-callback] 已落账 + 排队转发 authResult account=%s conn=%s app=%s",
                media.account_id, connection_id, meta.get("app_id"))


@router.get("/proxy/regions", response_model=ProxyRegionsResponse)
async def proxy_regions(
    external_user_id: str | None = None,
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
):
    """下发可选代理区域，供扫码绑定前让终端用户选择分发区域。

    - `regions`：当前可用（active / 未过期 / 连通正常）且已填区域的代理去重区域列表。
    - `last_selected_region`：该 `external_user_id` 上次选择的区域（便于平台默认回显）。
      **建议平台在绑定前调本接口**：若 `last_selected_region` 不在 `regions` 中（该区域当前已无
      可用代理），应弹窗让用户重新选择；为空（新用户）也应让用户选。绑定时把所选区域作为
      `POST /auth/start` 的 `region` 传回；不传则网关默认沿用 `last_selected_region`。
    """
    regions = await available_regions(db)
    last = await get_user_last_region(db, current_app.id, external_user_id)
    return ProxyRegionsResponse(regions=regions, last_selected_region=last)


@router.post("/auth/start", response_model=StartAuthorizationResponse)
async def auth_start(
    body: StartAuthorizationRequest,
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
):
    """发起云端授权扫码。

    - callBackData 注入 `app_id`，webhook 回来按此找租户 + 建绑定。
    - 从代理池挑一个可用代理传给灵径（抖音等平台云端登录要求走代理，且要与后续发布同 IP）；
      把所选 proxy_id 暂存到 Redis(tlf:auth-proxy:{operationId})，授权成功的 webhook 再绑定到新账号。
    - 池空时降级为不带代理（不阻断授权），仅告警。
    - 海外平台(provider=composio)走 OAuth 跳转：返回 redirect_url，无二维码/代理/区域。
    """
    # ── 海外平台(Composio)：OAuth 跳转授权，分流到独立逻辑 ──
    if provider_of(body.platform_code) == "composio":
        return await _composio_auth_start(body, current_app)

    cb = {
        "app_id": current_app.app_id,
        "platform_code": body.platform_code,
    }
    if body.external_user_id:
        cb["external_user_id"] = body.external_user_id

    # 本次生效的代理区域：显式传入优先，否则沿用该终端用户上次选择（都没有则 None=全局分配）。
    region = (body.region or "").strip() or None
    if region is None:
        region = await get_user_last_region(db, current_app.id, body.external_user_id)

    proxy_dict = None
    proxy_id = None
    # 代理分配：region 非空优先同区域；同时带 app + 终端用户做 IP 粘性（同用户尽量同一代理/地域）
    picked = await pick_available_proxy(
        db, body.platform_code,
        app_id=current_app.id, external_user_id=body.external_user_id, region=region,
    )
    if picked is not None:
        proxy_id, proxy_dict = picked
    else:
        logger.warning("[auth-start] 代理池无可用代理，本次授权不带代理 platform=%s region=%s",
                       body.platform_code, region)

    try:
        data = await lapi_client.start_cloud_authorization(
            body.platform_code,
            callback_data=cb,
            password=body.password,
            proxy=proxy_dict,
        )
    except UpstreamError as exc:
        raise exc

    operation_id = str(data.get("operationId") or "")
    redis = get_redis()
    # 暂存所选代理，供授权成功 webhook 绑定到账号（TTL 30 分钟覆盖扫码窗口）
    if operation_id and proxy_id:
        try:
            await redis.set(
                f"{settings.TLF_REDIS_PREFIX}auth-proxy:{operation_id}", proxy_id, ex=1800
            )
        except Exception as exc:
            logger.warning("[auth-start] 暂存授权代理失败 op=%s: %s", operation_id, exc)
    # 暂存本次代理区域，供授权成功 webhook 写入 media.proxy_region（下次扫码默认沿用 + 故障转移优先同区域）
    if operation_id and region:
        try:
            await redis.set(
                f"{settings.TLF_REDIS_PREFIX}auth-region:{operation_id}", region, ex=1800
            )
        except Exception as exc:
            logger.warning("[auth-start] 暂存授权代理区域失败 op=%s: %s", operation_id, exc)
    # 记录超时截止时刻：/auth/status 据此在上游静默时返回 timeout，避免接入方无限轮询。
    if operation_id:
        try:
            deadline = int(time.time()) + settings.AUTH_OP_TIMEOUT_SECONDS
            await redis.set(
                f"{settings.TLF_REDIS_PREFIX}auth-deadline:{operation_id}",
                str(deadline), ex=settings.AUTH_OP_STATE_TTL_SECONDS,
            )
        except Exception as exc:
            logger.warning("[auth-start] 暂存授权超时截止失败 op=%s: %s", operation_id, exc)

    return StartAuthorizationResponse(
        operation_id=operation_id,
        qr_code=data.get("qrCode"),
        scheme=data.get("scheme"),
        session_id=data.get("sessionId"),
        region=region,
    )


async def _composio_auth_start(
    body: StartAuthorizationRequest, current_app: DeveloperApp
) -> StartAuthorizationResponse:
    """海外平台授权：建/取 managed auth config → 发起连接 → 返回 OAuth 跳转链接。

    无代理、无区域、无扫码。external_user_id 必填（Composio 按 user_id 隔离账号）。
    把 connection 归属暂存 Redis，供 webhook / 轮询(/auth/status) 落账。
    """
    if not body.external_user_id:
        raise BadRequestError("海外平台授权需要 external_user_id（用于账号隔离）")
    toolkit = toolkit_of(body.platform_code)
    if not toolkit:
        raise BadRequestError(f"平台 {body.platform_code} 未登记 Composio toolkit")

    conn = await composio_client.start_connection(
        toolkit, body.external_user_id, settings.COMPOSIO_CALLBACK_URL or None,
    )
    connection_id = conn["connection_id"]
    redis = get_redis()
    try:
        await redis.set(
            f"{settings.TLF_REDIS_PREFIX}composio-conn:{connection_id}",
            json.dumps({
                "app_id": current_app.app_id,
                "external_user_id": body.external_user_id,
                "platform_code": body.platform_code,
                "toolkit": toolkit,
            }),
            ex=settings.AUTH_OP_STATE_TTL_SECONDS,
        )
        # 复用灵径的超时截止键，/auth/status 据此在上游静默时返回 timeout
        await redis.set(
            f"{settings.TLF_REDIS_PREFIX}auth-deadline:{connection_id}",
            str(int(time.time()) + settings.AUTH_OP_TIMEOUT_SECONDS),
            ex=settings.AUTH_OP_STATE_TTL_SECONDS,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("[auth-start] 暂存 composio 连接归属失败 conn=%s: %s", connection_id, exc)

    logger.info("[auth-start] composio 授权发起 platform=%s user=%s conn=%s",
                body.platform_code, body.external_user_id, connection_id)
    return StartAuthorizationResponse(
        operation_id=connection_id,
        redirect_url=conn.get("redirect_url"),
        qr_code=None,
    )


async def _composio_auth_status(
    db: AsyncSession, connection_id: str, meta_raw
) -> AuthStatusResponse:
    """海外平台授权轮询：查连接状态；ACTIVE 则落账返回 success，过期/失败返回 failed，否则 pending/timeout。"""
    meta = (json.loads(meta_raw) if isinstance(meta_raw, str) else meta_raw) or {}
    try:
        conn = await composio_client.get_connection(connection_id)
    except Exception as exc:  # noqa: BLE001
        logger.info("[auth-status] composio 查连接失败 conn=%s: %s", connection_id, exc)
        conn = {}
    status = (conn.get("status") or "").upper()
    if status == composio_client.STATUS_ACTIVE:
        media = await attach_composio_account(
            db,
            app_ref=meta.get("app_id"),
            external_user_id=meta.get("external_user_id"),
            platform_code=meta.get("platform_code") or conn.get("toolkit") or "",
            connection_id=connection_id,
            account_info=conn,
        )
        await db.commit()
        return AuthStatusResponse(
            status="success",
            account_id=media.account_id,
            platform_user_name=media.platform_user_name,
            platform_user_id=media.platform_user_id,
        )
    if status and (composio_client.is_connection_expired(status) or status == "FAILED"):
        return AuthStatusResponse(status="failed", error_message=f"授权未完成（{status}）")
    # 进行中：检查超时截止
    redis = get_redis()
    deadline_raw = await redis.get(f"{settings.TLF_REDIS_PREFIX}auth-deadline:{connection_id}")
    if deadline_raw is None or int(time.time()) >= int(deadline_raw):
        return AuthStatusResponse(status="timeout", error_message="授权超时未完成，请重新发起授权（停止轮询）")
    return AuthStatusResponse(status="pending")


@router.get("/auth/status/{operation_id}", response_model=AuthStatusResponse)
async def auth_status(
    operation_id: str,
    _current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
):
    redis = get_redis()
    # 海外平台(Composio)：operation_id = connection_id，按连接状态轮询 + ACTIVE 时落账
    conn_meta_raw = await redis.get(f"{settings.TLF_REDIS_PREFIX}composio-conn:{operation_id}")
    if conn_meta_raw:
        return await _composio_auth_status(db, operation_id, conn_meta_raw)
    raw = await redis.get(f"{settings.TLF_REDIS_PREFIX}auth-op:{operation_id}")
    payload = (json.loads(raw) if isinstance(raw, str) else raw) if raw else {}
    status = str(payload.get("status") or "pending")

    # 终态直接返回（success / failed）
    if status in ("success", "failed"):
        return AuthStatusResponse(
            status=status,
            platform_user_name=payload.get("platformUserName"),
            platform_user_id=payload.get("platformUserId"),
            account_id=payload.get("accountId") or payload.get("lapiAccountId"),
            error_message=payload.get("errorMessage"),
        )

    # 非终态（pending / 无状态）：检查超时截止。截止已过 或 op 未知/已过期 → timeout，停止轮询。
    deadline_raw = await redis.get(f"{settings.TLF_REDIS_PREFIX}auth-deadline:{operation_id}")
    if deadline_raw is None or int(time.time()) >= int(deadline_raw):
        return AuthStatusResponse(
            status="timeout",
            error_message="授权超时未完成，请重新发起授权（停止轮询）",
        )
    return AuthStatusResponse(status="pending")


@router.post("/auth/probe")
async def auth_probe(
    platform_code: str | None = None,
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
):
    """主动从灵径拉账号列表（webhook 不可达补救）。

    每条灵径会话经 media 层落账（找/建稳定账号 + 去重软删旧会话）；稳定账号自动绑入当前租户。
    """
    from datetime import datetime

    from sqlalchemy import select

    from tlf_app.models.tenant_account_binding import TenantAccountBinding
    from tlf_app.services.account_resolver import attach_session_to_media

    try:
        remote = await lapi_client.list_remote_accounts(platform_code)
    except UpstreamError as exc:
        raise exc

    now = datetime.utcnow()
    synced_sessions = 0
    created_bindings = 0
    seen_accounts: set[str] = set()
    for r in remote:
        lapi_account_id = str(r.get("id") or "")
        if not lapi_account_id:
            continue
        media = await attach_session_to_media(
            db,
            lapi_account_id=lapi_account_id,
            platform_code=str(r.get("platformCode") or ""),
            platform_user_id=str(r.get("platformUserId") or ""),
            platform_user_name=r.get("platformUserName"),
            platform_avatar=r.get("platformAvatar"),
            now=now,
        )
        synced_sessions += 1
        if media.account_id in seen_accounts:
            continue
        seen_accounts.add(media.account_id)
        binding = (await db.execute(
            select(TenantAccountBinding)
            .where(TenantAccountBinding.app_id == current_app.id)
            .where(TenantAccountBinding.account_id == media.account_id)
        )).scalar_one_or_none()
        if binding is None:
            db.add(TenantAccountBinding(
                app_id=current_app.id,
                account_id=media.account_id,
                status="active",
                bound_at=now,
            ))
            created_bindings += 1
    await db.commit()
    return ok({"synced_sessions": synced_sessions, "created_bindings": created_bindings})
