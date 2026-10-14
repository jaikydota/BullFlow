"""Composio 客户端：海外平台 OAuth 授权 + 直接执行发帖 action。

与灵径 `lapi_client` 并列——海外平台(provider=composio)走这里。要点：
- Composio SDK(0.16) 是**同步** httpx，所有调用用 `asyncio.to_thread` 包到线程，避免阻塞事件循环。
- managed 模式只需 `COMPOSIO_API_KEY`，不需各平台 OAuth client/secret，不需代理 IP。
- 授权 = `connected_accounts.link(user_id, auth_config_id, callback_url)` → redirect_url。
- 发帖 = `tools.execute(action_slug, arguments, user_id=...)` 同步返回。
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from composio import Composio

from tlf_app.core.config import settings
from tlf_app.core.exceptions import AppException
from tlf_app.core.redis import get_redis

logger = logging.getLogger(__name__)

# Composio 连接状态（connected_accounts.status）
STATUS_ACTIVE = "ACTIVE"
EXPIRED_STATES = {"EXPIRED", "REVOKED", "INACTIVE", "FAILED"}

_AUTHCFG_REDIS_PREFIX = f"{settings.TLF_REDIS_PREFIX}composio:authcfg:"


class ComposioError(AppException):
    """Composio 上游异常，对外 HTTP 502（与灵径 LapiError 同构）。"""
    def __init__(self, message: str = "海外平台上游调用失败", code: int = 50200):
        super().__init__(code=code, message=message)


class ComposioConfigError(ComposioError):
    """未配置 COMPOSIO_API_KEY。"""


_client: Composio | None = None


def _get_client() -> Composio:
    if not settings.COMPOSIO_API_KEY:
        raise ComposioConfigError("未配置 COMPOSIO_API_KEY，海外平台暂不可用")
    global _client
    if _client is None:
        # dangerously_allow_auto_upload_download_files：让 file_uploadable 字段（如 YouTube
        # videoFilePath）能直接传 URL —— SDK 自动下载并上传转 s3key（URL 绕过本地路径 allowlist）。
        _client = Composio(
            api_key=settings.COMPOSIO_API_KEY,
            dangerously_allow_auto_upload_download_files=True,
        )
    return _client


def is_connection_expired(status: str | None) -> bool:
    return (status or "").upper() in EXPIRED_STATES


def _dig(d: Any, key: str) -> Any:
    if isinstance(d, dict):
        return d.get(key)
    return getattr(d, key, None)


# ── auth config（每 toolkit 一次性，Redis 缓存 ac_id）──

async def get_or_create_auth_config(toolkit: str) -> str:
    """取/建该 toolkit 的 auth config，返回 ac_xxx。结果长期缓存到 Redis。

    取用优先级：
    1. `.env` 的 `COMPOSIO_AUTH_CONFIG_IDS` 显式登记 —— **自建 OAuth app 的平台只能走这条**
       （如 X/Twitter：Composio 已取消其托管凭证，走 managed 新建必失败）；
    2. Redis 缓存；
    3. 当前 project 下该 toolkit 已存在的配置；
    4. 新建 managed 配置。
    """
    configured = settings.composio_auth_config_map().get(toolkit.lower())
    if configured:
        return configured

    redis = get_redis()
    key = f"{_AUTHCFG_REDIS_PREFIX}{toolkit}"
    try:
        cached = await redis.get(key)
        if cached:
            return cached
    except Exception:  # noqa: BLE001
        pass

    def _work() -> str:
        client = _get_client()
        # 先找已存在的 auth config（避免重复建）
        try:
            existing = client.auth_configs.list(toolkit_slug=toolkit)
            for it in (getattr(existing, "items", None) or []):
                ac_id = getattr(it, "id", None)
                if ac_id:
                    return ac_id
        except Exception as exc:  # noqa: BLE001
            logger.info("[composio] list auth_configs(%s) 失败，转新建：%s", toolkit, exc)
        resp = client.auth_configs.create(
            toolkit=toolkit,
            options={"type": "use_composio_managed_auth"},
        )
        # create 返回的就是 AuthConfig 本身（.id 直接），不是带 .auth_config 的 wrapper
        return getattr(resp, "id", None) or resp.auth_config.id

    try:
        ac_id = await asyncio.to_thread(_work)
    except ComposioError:
        raise
    except Exception as exc:  # noqa: BLE001
        # 该 toolkit 无 Composio 托管凭证（如 X/Twitter、TikTok）时报 DefaultAuthConfigNotFound，
        # 只能自建 OAuth app 后把 ac_id 登记到 COMPOSIO_AUTH_CONFIG_IDS，给出可操作提示而非裸异常。
        if "DefaultAuthConfigNotFound" in str(exc) or "default auth config" in str(exc).lower():
            raise ComposioError(
                f"平台 {toolkit} 无托管凭证，需自建 OAuth app 并把 auth config id "
                f"登记到 COMPOSIO_AUTH_CONFIG_IDS（形如 {toolkit}=ac_xxx）"
            ) from exc
        raise ComposioError(f"创建 auth config 失败（{toolkit}）：{exc}") from exc
    try:
        await redis.set(key, ac_id)  # auth config 稳定，长期缓存
    except Exception:  # noqa: BLE001
        pass
    return ac_id


# ── 连接（授权）──

def _fix_authorize_url(url: str | None) -> str | None:
    """修正上游生成的过期授权域名。

    X 已废弃 `twitter.com/i/oauth2/authorize`，该地址返回 404 空白页，用户点开就是「页面不存在」
    （Composio issue #3229）。这里统一换成现行的 x.com 域，其余域名原样返回。
    """
    if not url:
        return url
    return url.replace("https://twitter.com/i/oauth2/", "https://x.com/i/oauth2/")


async def start_connection(toolkit: str, external_user_id: str, callback_url: str | None) -> dict:
    """发起用户授权：返回 {connection_id, redirect_url, status}。把 redirect_url 给用户去 OAuth。"""
    ac_id = await get_or_create_auth_config(toolkit)

    def _work() -> dict:
        # allow_multiple：同一用户重复发起授权（如上次没看到成功页又点了一次）不报错；
        # 落账按 (platform_code, platform_user_id) 去重，多连接也只认最新那条。
        req = _get_client().connected_accounts.link(
            external_user_id, ac_id, callback_url=callback_url or None,
            allow_multiple=True,
        )
        return {
            "connection_id": req.id,
            "redirect_url": _fix_authorize_url(req.redirect_url),
            "status": req.status,
        }

    try:
        return await asyncio.to_thread(_work)
    except ComposioError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ComposioError(f"发起授权失败（{toolkit}）：{exc}") from exc


def _proxy_get_json(client, connection_id: str, url: str) -> dict:
    """用连接凭证 GET 一个平台 API，返回 data dict（tools.proxy 同步）。

    非 2xx 或 data 非 dict 时**不抛**（调用方按空 dict 兜底），但一定打 warning 带响应片段——
    否则平台侧的权限 / 计费 / 限流错误会被静默吞掉，线上只看到昵称头像为空却查不到原因。
    """
    r = client.tools.proxy(endpoint=url, method="GET", connected_account_id=connection_id)
    d = r if isinstance(r, dict) else (r.model_dump() if hasattr(r, "model_dump") else {})
    status = d.get("status") or d.get("status_code")
    data = d.get("data")
    if (isinstance(status, int) and status >= 400) or not isinstance(data, dict):
        logger.warning("[composio] proxy GET %s conn=%s status=%s body=%s",
                       url, connection_id, status, str(data if data is not None else d)[:500])
        return {}
    return data


def _resolve_identity(client, connection_id: str, toolkit_slug: str | None) -> dict:
    """连接激活后按 toolkit 用 `tools.proxy` 调平台 API 拿**稳定用户标识**。

    海外连接 data 通常只有 token，平台真实 user id/昵称/头像得另调接口。
    **仅 LinkedIn 已实测**（/v2/userinfo → sub）；其余按各平台标准 OAuth /me 接口**预估**，
    上线/接入前需用真实连接核对返回字段（endpoint 路径、字段名可能要调整）。
    失败返回 {}（落账会用 external_user_id 兜底 platform_user_id）。
    """
    if not toolkit_slug:
        return {}
    try:
        if toolkit_slug == "linkedin":
            # 注：LinkedIn OpenID userinfo 实测**不返回 picture**（头像需旧 r_liteprofile scope，
            # managed 模式拿不到），故头像常为空，前端用首字母兜底。
            info = _proxy_get_json(client, connection_id, "https://api.linkedin.com/v2/userinfo")
            return {
                "platform_user_id": info.get("sub"),
                "platform_user_name": info.get("name"),
                "platform_avatar": info.get("picture"),
            }
        if toolkit_slug == "twitter":
            # X API v2：GET /2/users/me → {data:{id, name, username, profile_image_url}}。
            # 需 users.read scope；头像默认给 _normal 小图(48px)，去掉后缀换原图。
            info = _proxy_get_json(
                client, connection_id,
                "https://api.x.com/2/users/me?user.fields=profile_image_url,username,name",
            )
            node = info.get("data") if isinstance(info.get("data"), dict) else info
            uname = node.get("username")
            if not node.get("id"):
                # X 报错体形如 {title, detail, status, errors:[...]}（如 403 权限 / 402 计费）；记下来便于线上排查
                logger.warning("[composio] X users/me 未返回用户 id conn=%s body=%s", connection_id, str(info)[:500])
            avatar = node.get("profile_image_url") or None
            if avatar:
                avatar = avatar.replace("_normal.", ".")
            return {
                "platform_user_id": node.get("id"),
                "platform_user_name": node.get("name") or uname,
                "platform_avatar": avatar,
                "platform_home_url": f"https://x.com/{uname}" if uname else None,
            }
        if toolkit_slug == "reddit":
            # 预估：Reddit OAuth GET https://oauth.reddit.com/api/v1/me → {id, name(用户名), icon_img}
            info = _proxy_get_json(client, connection_id, "https://oauth.reddit.com/api/v1/me")
            avatar = (info.get("icon_img") or "").split("?")[0] or None
            name = info.get("name")
            return {
                "platform_user_id": info.get("id") or name,
                "platform_user_name": name,
                "platform_avatar": avatar,
                "platform_home_url": f"https://www.reddit.com/user/{name}" if name else None,
            }
        if toolkit_slug == "facebook":
            # 预估：Graph API GET /me?fields=id,name,picture → {id, name, picture.data.url}
            info = _proxy_get_json(client, connection_id, "https://graph.facebook.com/me?fields=id,name,picture")
            pic = info.get("picture")
            avatar = ((pic or {}).get("data") or {}).get("url") if isinstance(pic, dict) else None
            fid = info.get("id")
            return {
                "platform_user_id": fid,
                "platform_user_name": info.get("name"),
                "platform_avatar": avatar,
                "platform_home_url": f"https://www.facebook.com/{fid}" if fid else None,
            }
        if toolkit_slug == "instagram":
            # 实测：Instagram Graph GET /me?fields=id,username,profile_picture_url（Business/Creator）
            info = _proxy_get_json(
                client, connection_id,
                "https://graph.instagram.com/me?fields=id,username,profile_picture_url",
            )
            uname = info.get("username")
            return {
                "platform_user_id": info.get("id"),
                "platform_user_name": uname,
                "platform_avatar": info.get("profile_picture_url"),
                "platform_home_url": f"https://www.instagram.com/{uname}/" if uname else None,
            }
        if toolkit_slug == "youtube":
            # 预估：YouTube Data API GET /youtube/v3/channels?part=snippet&mine=true → items[0]
            info = _proxy_get_json(
                client, connection_id,
                "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
            )
            items = info.get("items") or []
            ch = items[0] if items else {}
            snip = ch.get("snippet") or {}
            thumb = ((snip.get("thumbnails") or {}).get("default") or {}).get("url")
            cid = ch.get("id")
            custom = (snip.get("customUrl") or "").lstrip("@")
            return {
                "platform_user_id": cid,
                "platform_user_name": snip.get("title"),
                "platform_avatar": thumb,
                # 优先频道 handle（@xxx）主页，否则 channel id 主页
                "platform_home_url": (
                    f"https://www.youtube.com/@{custom}" if custom
                    else (f"https://www.youtube.com/channel/{cid}" if cid else None)
                ),
            }
    except Exception as exc:  # noqa: BLE001
        logger.warning("[composio] 解析身份失败 toolkit=%s conn=%s: %s", toolkit_slug, connection_id, exc)
    return {}


async def get_connection(connection_id: str) -> dict:
    """查连接状态；active 时按 toolkit 解析稳定用户标识。

    返回 {status, toolkit, platform_user_id, platform_user_name, platform_avatar}。
    """
    def _work() -> dict:
        client = _get_client()
        acc = client.connected_accounts.get(connection_id)
        toolkit = getattr(acc, "toolkit", None)
        toolkit_slug = ((_dig(toolkit, "slug") or "").lower() or None) if toolkit is not None else None
        status = getattr(acc, "status", None)
        ident = _resolve_identity(client, connection_id, toolkit_slug) if (status or "").upper() == STATUS_ACTIVE else {}
        return {
            "status": status,
            "toolkit": toolkit_slug,
            "platform_user_id": ident.get("platform_user_id"),
            "platform_user_name": ident.get("platform_user_name"),
            "platform_avatar": ident.get("platform_avatar"),
            "platform_home_url": ident.get("platform_home_url"),
        }

    try:
        return await asyncio.to_thread(_work)
    except ComposioError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ComposioError(f"查询连接失败：{exc}") from exc


async def verify_webhook(
    *, webhook_id: str, timestamp: str, signature: str, raw_body: bytes
) -> bool:
    """验签 Composio webhook（svix 风格：HMAC-SHA256 over "{id}.{timestamp}.{body}"，
    签名头 `webhook-signature` 形如 `v1,<base64>`）。用官方 SDK `triggers.verify_webhook`
    处理 secret 编码 / 多签名 / 时间窗(默认 300s)，避免手写 HMAC 的编码歧义。

    未配 COMPOSIO_WEBHOOK_SECRET → 返回 True（不验，仅本地/未接入时）；
    已配但头缺失或校验失败 → 返回 False（端点据此拒绝）。
    """
    secret = settings.COMPOSIO_WEBHOOK_SECRET
    if not secret:
        return True
    if not (webhook_id and timestamp and signature):
        return False

    def _work() -> bool:
        try:
            _get_client().triggers.verify_webhook(
                id=webhook_id,
                payload=raw_body.decode("utf-8"),
                signature=signature,
                timestamp=timestamp,
                secret=secret,
            )
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("[composio] webhook 验签失败：%s", exc)
            return False

    return await asyncio.to_thread(_work)


async def delete_connection(connection_id: str) -> None:
    """删除连接（解绑）。best-effort，失败仅告警。"""
    def _work() -> None:
        _get_client().connected_accounts.delete(connection_id)

    try:
        await asyncio.to_thread(_work)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[composio] 删除连接失败 %s：%s", connection_id, exc)


# ── 发帖（直接执行 action）──

async def proxy_get(connection_id: str, url: str) -> dict:
    """用连接凭证 GET 一个平台 API（异步），返回 data dict。供发布层查 page/容器等。"""
    def _work() -> dict:
        return _proxy_get_json(_get_client(), connection_id, url)

    try:
        return await asyncio.to_thread(_work)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[composio] proxy_get 失败 %s: %s", url, exc)
        return {}


async def execute_action(
    action_slug: str, external_user_id: str, arguments: dict,
    *, connection_id: str | None = None,
) -> dict:
    """执行某 toolkit action（如发推）。返回 {successful, data, error}。"""
    def _work() -> dict:
        # dangerously_skip_version_check：手动 execute 不指定 toolkit version 会报
        # ToolVersionRequiredError，这里用 latest（新版发布时留意行为变化）。
        kwargs: dict[str, Any] = {"user_id": external_user_id, "dangerously_skip_version_check": True}
        if connection_id:
            kwargs["connected_account_id"] = connection_id
        resp = _get_client().tools.execute(action_slug, arguments, **kwargs)
        # 实测 execute 返回的是 dict（非 pydantic 对象），兼容两者取值
        def _g(k, default=None):
            return resp.get(k, default) if isinstance(resp, dict) else getattr(resp, k, default)
        return {"successful": bool(_g("successful", False)), "data": _g("data"), "error": _g("error")}

    try:
        return await asyncio.to_thread(_work)
    except ComposioError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ComposioError(f"执行发布 action 失败（{action_slug}）：{exc}") from exc
