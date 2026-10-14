"""灵径 lapi.cc SDK 客户端。

- Redis 缓存键前缀：`settings.TLF_REDIS_PREFIX + "lapi:"`
- 上游异常统一抛 tlf_app.core.exceptions.UpstreamError
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid as _uuid
from typing import Any

import httpx

from tlf_app.core.config import settings
from tlf_app.core.exceptions import AppException, UpstreamError
from tlf_app.core.redis import get_redis
from tlf_app.services.publish_spec import build_extra_fields

logger = logging.getLogger(__name__)


# ============ 异常 ============

def _sanitize_msg(message: str) -> str:
    """对外错误消息隐藏上游厂商名（品牌规范：对外/SDK 不暴露「灵径」）。内部日志仍打全文。"""
    return (message or "").replace("灵径", "上游平台")


class LapiError(AppException):
    """网关调用上游平台失败的基类；默认按「上游异常」(50200→HTTP 502) 对外抛出，message 透传可读原因。"""
    def __init__(self, message: str = "上游平台调用失败", code: int = 50200):
        super().__init__(code=code, message=_sanitize_msg(message))


class LapiGatewayError(LapiError):
    """网关↔上游 网络/响应异常（超时、非 JSON、HTTP 非 2xx 无业务体等）→ 对外 502。"""
    def __init__(self, message: str = "上游平台网关异常"):
        super().__init__(message=message, code=50200)


class LapiBusinessError(LapiError):
    """上游平台返回的业务报错（带其 code + message）。

    把上游报错**透传给调用方**而不是吞成 500：
    - 上游 4xxxx（请求/内容不合规，如缺字段、参数非法）→ 对外 40000(HTTP 400)，message 含平台校验原因；
    - 其余（5xxxx / 未知，如取素材失败、平台内部错）→ 对外 50200(HTTP 502)。
    `data.upstream_code` 保留平台原始码便于排查；对外消息隐藏厂商名。
    """
    def __init__(self, message: str, lapi_code: int):
        self.lapi_code = lapi_code
        self.lapi_message = message
        sdk_code = 40000 if 40000 <= int(lapi_code) < 50000 else 50200
        super().__init__(message=message, code=sdk_code)
        self.data = {"upstream_code": lapi_code}


# ============ 登录态失效识别 ============
# 灵径账号 cookie 失效时返回的业务码 + 消息特征（命中即认为该账号需重新扫码授权）。
# 用于同步操作（取分类/概览/发布）检测到登录失效时，把账号置 expired 引导用户重新授权。
LAPI_LOGIN_EXPIRED_CODES = {172403}
_LOGIN_EXPIRED_MARKERS = ("登录失效", "登录态", "未登录", "账号未登录", "登录已过期", "重新登录")


def is_login_expired(exc: "LapiBusinessError") -> bool:
    """判断一个灵径业务错误是否为「账号登录态失效」（需用户重新扫码），而非普通参数/内容错误。"""
    try:
        if int(getattr(exc, "lapi_code", 0)) in LAPI_LOGIN_EXPIRED_CODES:
            return True
    except (TypeError, ValueError):
        pass
    msg = getattr(exc, "lapi_message", "") or getattr(exc, "message", "") or ""
    return any(m in msg for m in _LOGIN_EXPIRED_MARKERS)


# ── 代理异常识别：灵径侧连不上/认证不过该代理（→ 禁用代理 + 解绑账号重分） ──
# 必须命中 socks/proxy/认证 特征，避免把普通「网络异常」误判为代理坏（误禁好代理）。
_PROXY_ERROR_MARKERS = (
    "socks5", "socks", "代理", "proxy", "authentication failed",
    "proxy connect", "代理连接", "连接代理", "proxy authentication",
)


def is_proxy_error(exc: "LapiBusinessError") -> bool:
    """判断灵径业务错误是否为「该账号所用代理异常」（如 172001 网络异常:Socks5 Authentication failed）。"""
    if not isinstance(exc, LapiBusinessError):
        return False
    msg = (getattr(exc, "lapi_message", "") or getattr(exc, "message", "") or "").lower()
    return any(m in msg for m in _PROXY_ERROR_MARKERS)


# ============ Token 缓存 ============

_TOKEN_LOCK = asyncio.Lock()
_TOKEN_KEY_ACCESS = f"{settings.TLF_REDIS_PREFIX}lapi:token:access"
_TOKEN_KEY_EXPIRE_AT = f"{settings.TLF_REDIS_PREFIX}lapi:token:expires_at"
_TOKEN_REFRESH_AHEAD = 60


async def _fetch_access_token() -> tuple[str, int]:
    if not settings.LAPI_APP_ID or not settings.LAPI_SECRET:
        raise LapiGatewayError("灵径凭据未配置（LAPI_APP_ID / LAPI_SECRET）")

    url = f"{settings.LAPI_BASE_URL}/api/open/auth/authenticate"
    payload = {"appId": settings.LAPI_APP_ID, "secret": settings.LAPI_SECRET}
    logger.info("[LAPI-AUTH-REQ] POST %s | body=%s", url, _fmt(payload))
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=settings.LAPI_HTTP_TIMEOUT) as client:
            resp = await client.post(url, json=payload, headers={"Content-Type": "application/json"})
    except httpx.HTTPError as exc:
        detail = _exc_detail(exc)
        logger.warning("[LAPI-AUTH-ERR] POST %s | 网络异常：%s", url, detail)
        raise LapiGatewayError(f"获取 access_token 网络异常：{detail}") from exc
    elapsed_ms = int((time.monotonic() - started) * 1000)
    logger.info("[LAPI-AUTH-RESP] %s | status=%s | %dms | body=%s",
                url, resp.status_code, elapsed_ms, _truncate(resp.text))
    if resp.status_code != 200:
        raise LapiGatewayError(f"获取 access_token HTTP {resp.status_code}")
    body = resp.json()
    if body.get("code") != 0:
        raise LapiBusinessError(str(body.get("message", "auth failed")), int(body.get("code", -1)))
    data = body.get("data") or {}
    token = data.get("accessToken") or data.get("token") or data.get("access_token")
    expires_in = int(data.get("expiresIn") or data.get("expires_in") or 7200)
    if not token:
        raise LapiGatewayError("access_token 响应缺失 accessToken 字段")
    return token, expires_in


async def get_access_token() -> str:
    redis = get_redis()
    token = await redis.get(_TOKEN_KEY_ACCESS)
    exp_at_raw = await redis.get(_TOKEN_KEY_EXPIRE_AT)
    now = int(time.time())
    if token and exp_at_raw and (now + _TOKEN_REFRESH_AHEAD < int(exp_at_raw)):
        return token

    async with _TOKEN_LOCK:
        token = await redis.get(_TOKEN_KEY_ACCESS)
        exp_at_raw = await redis.get(_TOKEN_KEY_EXPIRE_AT)
        if token and exp_at_raw and (now + _TOKEN_REFRESH_AHEAD < int(exp_at_raw)):
            return token

        token, expires_in = await _fetch_access_token()
        expires_at = now + expires_in
        await redis.set(_TOKEN_KEY_ACCESS, token, ex=max(expires_in - _TOKEN_REFRESH_AHEAD, 60))
        await redis.set(_TOKEN_KEY_EXPIRE_AT, str(expires_at), ex=max(expires_in - _TOKEN_REFRESH_AHEAD, 60))
        return token


# ============ 日志工具 ============

_SENSITIVE_KEYS = ("secret", "token", "password", "pwd", "appkey", "app_key")


def _truncate(text: str, limit: int | None = None) -> str:
    """超长截断（保留 limit 字符 + 提示）。limit=None 取配置；0 = 不截断。"""
    if limit is None:
        limit = settings.LAPI_LOG_MAX_CHARS
    if not limit or len(text) <= limit:
        return text
    return f"{text[:limit]}...(truncated, total={len(text)} chars)"


def _safe_payload(payload: Any) -> Any:
    """递归脱敏：dict 里命中敏感 key 的值替换为 ***，嵌套 dict / list 一并处理。"""
    if isinstance(payload, dict):
        out: dict = {}
        for k, v in payload.items():
            if isinstance(k, str) and any(p in k.lower() for p in _SENSITIVE_KEYS):
                out[k] = "***"
            else:
                out[k] = _safe_payload(v)
        return out
    if isinstance(payload, (list, tuple)):
        return [_safe_payload(i) for i in payload]
    return payload


def _fmt(obj: Any, limit: int | None = None) -> str:
    """把任意对象脱敏后 JSON 序列化并截断，用于日志。"""
    try:
        text = json.dumps(_safe_payload(obj), ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        text = str(_safe_payload(obj))
    return _truncate(text, limit)


def _exc_detail(exc: Exception) -> str:
    """把异常转成可读详情：timeout 类异常 str() 常为空，必须带上类名，否则日志一片空白。"""
    if isinstance(exc, httpx.TimeoutException):
        return f"请求超时（>{settings.LAPI_HTTP_TIMEOUT}s，{type(exc).__name__}）"
    s = str(exc)
    return f"{type(exc).__name__}: {s}" if s else type(exc).__name__


async def _request(
    method: str,
    path: str,
    *,
    json_body: dict | None = None,
    params: dict | None = None,
    extra_headers: dict | None = None,
    retry_on_token_expired: bool = True,
) -> dict:
    token = await get_access_token()
    url = f"{settings.LAPI_BASE_URL}{path}"
    headers = {"Authorization": f"Bearer {token}"}
    if extra_headers:
        headers.update(extra_headers)

    effective_body = json_body
    if effective_body is None and method.upper() in {"POST", "PUT", "PATCH"}:
        effective_body = {}
    if effective_body is not None:
        headers["Content-Type"] = "application/json"

    # 脱敏后的额外头（不打 Authorization 全量 token，只留前 12 位便于排查）
    log_headers = {k: v for k, v in headers.items() if k != "Authorization"}
    if "Authorization" in headers:
        log_headers["Authorization"] = f"Bearer {token[:12]}...(len={len(token)})"

    logger.info(
        "[LAPI-REQ] %s %s | params=%s | headers=%s | body=%s",
        method, url,
        _fmt(params),
        _fmt(log_headers),
        _fmt(effective_body),
    )
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=settings.LAPI_HTTP_TIMEOUT) as client:
            resp = await client.request(method, url, json=effective_body, params=params, headers=headers)
    except httpx.HTTPError as exc:
        elapsed_ms = int((time.monotonic() - started) * 1000)
        detail = _exc_detail(exc)
        logger.warning("[LAPI-ERR] %s %s | %dms | 网络异常：%s", method, url, elapsed_ms, detail)
        raise LapiGatewayError(f"灵径接口网络异常：{detail}") from exc

    elapsed_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "[LAPI-RESP] %s %s | status=%s | %dms | body=%s",
        method, url, resp.status_code, elapsed_ms, _truncate(resp.text),
    )
    if resp.status_code == 401:
        if retry_on_token_expired:
            redis = get_redis()
            await redis.delete(_TOKEN_KEY_ACCESS, _TOKEN_KEY_EXPIRE_AT)
            return await _request(method, path, json_body=json_body, params=params, retry_on_token_expired=False)
        raise LapiGatewayError("灵径 access_token 失效")
    if not 200 <= resp.status_code < 300:
        logger.warning("[LAPI-ERR] %s %s | HTTP %s | %s", method, url, resp.status_code, _truncate(resp.text))
        # 灵径常在非 2xx 仍带业务体 {code, message}（如 502001 platform not support）；
        # 优先抛业务错误把可读 message 透出，而不是笼统的 HTTP 500。
        try:
            err_body = resp.json()
        except json.JSONDecodeError:
            err_body = None
        if isinstance(err_body, dict) and err_body.get("code") not in (None, 0):
            raise LapiBusinessError(str(err_body.get("message") or "灵径业务错误"), int(err_body.get("code")))
        raise LapiGatewayError(f"灵径返回 HTTP {resp.status_code}：{_truncate(resp.text)}")

    try:
        body = resp.json()
    except json.JSONDecodeError as exc:
        logger.warning("[LAPI-ERR] %s %s | 响应非 JSON：%s", method, url, _truncate(resp.text))
        raise LapiGatewayError(f"灵径响应非 JSON：{exc}") from exc

    code = body.get("code", -1)
    if code != 0:
        msg = str(body.get("message", "unknown error"))
        if code == 401001 and retry_on_token_expired:
            logger.info("[LAPI] %s %s | token 失效(401001)，清缓存重试一次", method, url)
            redis = get_redis()
            await redis.delete(_TOKEN_KEY_ACCESS, _TOKEN_KEY_EXPIRE_AT)
            return await _request(method, path, json_body=json_body, params=params, retry_on_token_expired=False)
        logger.warning("[LAPI-ERR] %s %s | 业务码=%s message=%s", method, url, code, msg)
        raise LapiBusinessError(msg, int(code))

    return body.get("data") or {}


# ============ 业务：账号授权 ============

async def start_cloud_authorization(
    platform_code: str,
    *,
    callback_data: dict | None = None,
    proxy: dict | None = None,
    password: str | None = None,
) -> dict:
    body: dict[str, Any] = {"type": "create", "platformCode": platform_code}
    if password:
        body["password"] = password
    if callback_data:
        body["callBackData"] = callback_data
    if proxy:
        body["proxy"] = proxy
    return await _request("POST", "/api/open/media-accounts/authorizations", json_body=body)


async def refresh_authorization(
    lapi_account_id: str,
    *,
    callback_data: dict | None = None,
    password: str | None = None,
    proxy: dict | None = None,
) -> dict:
    body: dict[str, Any] = {"type": "update", "accountId": lapi_account_id}
    if password:
        body["password"] = password
    if callback_data:
        body["callBackData"] = callback_data
    if proxy:
        body["proxy"] = proxy
    return await _request("POST", "/api/open/media-accounts/authorizations", json_body=body)


async def get_remote_account(lapi_account_id: str) -> dict:
    return await _request("GET", f"/api/open/media-accounts/{lapi_account_id}")


def _extract_account_page(data: Any) -> tuple[list[dict], int | None, int | None]:
    """从 /api/open/media-accounts 响应抽取 (账号数组, total, totalPages)。

    上游分页结构：data = {data:[...], total, page, pageSize, totalPages}（见接口文档）；
    同时兼容直接返回数组 / items / list / records 等历史形态。
    """
    if isinstance(data, list):
        return data, None, None
    if isinstance(data, dict):
        items: list[dict] = []
        for k in ("data", "items", "list", "records"):
            v = data.get(k)
            if isinstance(v, list):
                items = v
                break
        total = data.get("total") if isinstance(data.get("total"), int) else None
        total_pages = data.get("totalPages") if isinstance(data.get("totalPages"), int) else None
        return items, total, total_pages
    return [], None, None


async def list_remote_accounts(platform_code: str | None = None) -> list[dict]:
    """拉取灵径**全部**已授权媒体账号（自动翻页）。

    上游 `/api/open/media-accounts` 默认 pageSize=10，必须翻页，否则只拿到第一页——
    这对「全量同步」是致命的（其余账号会被误判为消失而标 revoked / 释放）。
    用 pageSize=100（上游上限）按 total/totalPages 翻完所有页。
    """
    PAGE_SIZE = 100  # 上游 pageSize 上限
    out: list[dict] = []
    page = 1
    while True:
        params: dict[str, Any] = {"page": page, "pageSize": PAGE_SIZE}
        if platform_code:
            params["platformCode"] = platform_code
        data = await _request("GET", "/api/open/media-accounts", params=params)
        items, total, total_pages = _extract_account_page(data)
        out.extend(items)
        if not items:
            break
        # 优先按上游分页元数据判断是否翻完
        if total_pages is not None and page >= total_pages:
            break
        if total is not None and len(out) >= total:
            break
        # 无分页元数据时：本页不足一整页即视为末页
        if total_pages is None and total is None and len(items) < PAGE_SIZE:
            break
        page += 1
        if page > 1000:  # 安全阀，防止上游忽略 page 导致死循环
            logger.warning("[LAPI] media-accounts 翻页超过 1000 页，提前停止（已拉 %d 条）", len(out))
            break
    return out


async def revoke_remote_account(lapi_account_id: str) -> dict:
    return await _request("DELETE", f"/api/open/media-accounts/{lapi_account_id}")


# ============ 业务：发布 ============

async def submit_publish(
    *,
    lapi_account_ids: list[str],
    content: dict,
    callback_data: dict | None = None,
    publish_type: str = "dynamic",
    publish_channel: str = "cloud",
    sub_task_ids: list[str] | None = None,
    proxy: dict | None = None,
    platform_code: str | None = None,
    extras: dict | None = None,
) -> dict:
    title = content.get("title") or ""
    desc = content.get("desc") or content.get("body") or ""
    raw_images = content.get("images") or content.get("mediaUrls") or []
    images = [i if isinstance(i, dict) else {"pathOrUrl": i} for i in raw_images]
    video_url = content.get("videoUrl") or content.get("video")
    raw_covers = content.get("covers") or content.get("coverUrls") or []
    if not raw_covers and content.get("thumbnailUrl"):
        raw_covers = [content["thumbnailUrl"]]
    covers = [c if isinstance(c, dict) else {"pathOrUrl": c} for c in raw_covers]
    html_content = content.get("content") or content.get("html") or desc

    if sub_task_ids is None:
        sub_task_ids = [str(_uuid.uuid4()) for _ in lapi_account_ids]
    elif len(sub_task_ids) != len(lapi_account_ids):
        raise ValueError("sub_task_ids 与 lapi_account_ids 长度不一致")

    extra_fields = build_extra_fields(platform_code or "", publish_type, extras)

    def _build_publish_data() -> dict[str, Any]:
        if publish_type == "video":
            data: dict[str, Any] = {"title": title, "desc": desc}
            if video_url:
                data["video"] = {"url": video_url}
            if covers:
                data["covers"] = covers
        elif publish_type == "article":
            data = {"title": title, "content": html_content}
            if covers:
                data["covers"] = covers
        else:
            data = {"title": title, "desc": desc}
            if images:
                data["images"] = images
        data.update(extra_fields)
        return data

    publish_data = _build_publish_data()
    proxy_for_task = proxy or {}
    tasks = []
    for acc_id, sub_tid in zip(lapi_account_ids, sub_task_ids, strict=True):
        tasks.append({
            "taskId": sub_tid,
            "authorInfo": {"id": acc_id, "proxy": proxy_for_task},
            "publishData": publish_data,
        })

    body: dict[str, Any] = {
        "publishType": publish_type,
        "publishChannel": publish_channel,
        "tasks": tasks,
        "need_parts_back": False,
    }
    if callback_data:
        body["callBackData"] = callback_data
    return await _request("POST", "/api/web/platform-publish/tasks", json_body=body)


async def request_publish_result(
    *,
    publish_id: str,
    publish_type: str = "dynamic",
    task_id: str | None = None,
    callback_data: dict | None = None,
) -> dict:
    body: dict[str, Any] = {"publishId": publish_id, "publishType": publish_type}
    if task_id:
        body["taskId"] = task_id
    if callback_data:
        body["callBackData"] = callback_data
    return await _request("POST", "/api/web/platform-publish/check-tasks", json_body=body)


# ============ 业务：账号指标 ============

async def get_publish_categories(lapi_account_id: str, publish_type: str) -> list[dict]:
    """获取某账号某发布类型的内容分类树（同步返回；按 x-account-id + publishType）。

    返回 `data.list` 树形：[{yixiaoerId, yixiaoerName, raw, child:[...]}]。
    分类变动极少，调用方应缓存。

    容错：取分类是尽力而为的配置拉取——
    - **登录失效**（172403 等）必须抛出（上层据此置 expired、引导重新授权）；
    - 其它业务错误（如上游用 code=-1 表达「该账号此类型无分类」，常见于微博视频等 category 可选平台）
      一律**视为「无分类」返回空列表**，不要 502 接入方。真需要分类且必填的平台，发布接口自会报清晰错误。
    """
    try:
        data = await _request(
            "POST",
            "/api/web/config-data/publish-category-tasks",
            json_body={"publishType": publish_type},
            extra_headers={"x-account-id": lapi_account_id},
        )
    except LapiBusinessError as exc:
        if is_login_expired(exc):
            raise  # 登录失效是真问题，交由上层置 expired
        logger.info(
            "[LAPI] 取分类业务错误（视为无可用分类，返回空）：code=%s msg=%s",
            getattr(exc, "lapi_code", "?"), getattr(exc, "lapi_message", str(exc)),
        )
        return []
    if isinstance(data, dict) and isinstance(data.get("list"), list):
        return data["list"]
    if isinstance(data, list):
        return data
    return []


async def get_author_info(lapi_account_id: str) -> dict:
    """获取媒体号作者信息（同步返回；Header x-account-id=会话 id + 空 body）。

    返回上游 `data`（部分平台带 raw.sec_uid 等可拼主页的字段）。**需账号 cookie 有效**，
    否则上游报「登录失效 / 未开通」等业务错误（由调用方 best-effort 吞掉，不阻塞主流程）。
    """
    data = await _request(
        "POST",
        "/api/web/platform-account/info-tasks",
        json_body={},
        extra_headers={"x-account-id": lapi_account_id},
    )
    return data if isinstance(data, dict) else {}


async def check_login_status(lapi_account_id: str, *, proxy: dict | None = None) -> dict:
    """检测媒体号登录有效性（同步；Header x-account-id + 可选 proxy）。支持所有平台。

    ⚠️ 灵径 `/api/open/media-accounts/{id}` **不返回登录态**，登录是否有效必须走此专用接口。
    返回上游 data `{loginStatus: int}`：`1`=有效 / `0`=无效（登录已失效）/
    其他（如 `-1`）=检测异常（多为服务 IP 被平台风控临时限制，建议走代理，**勿据此误判失效**）。
    """
    body: dict[str, Any] = {}
    if proxy:
        body["proxy"] = proxy
    data = await _request(
        "POST", "/api/web/platform-account/login-status-tasks",
        json_body=body or None, extra_headers={"x-account-id": lapi_account_id},
    )
    return data if isinstance(data, dict) else {}


async def get_publish_risk_status(lapi_account_id: str, *, proxy: dict | None = None) -> dict:
    """获取媒体号发布风控状态（同步；Header x-account-id）。支持抖音。

    返回 `{risk_status: bool, check_methods: [{type: "password"|"smscode", name}]}`。
    """
    body: dict[str, Any] = {}
    if proxy:
        body["proxy"] = proxy
    data = await _request(
        "POST", "/api/web/platform-account/publish-risk-tasks",
        json_body=body or None, extra_headers={"x-account-id": lapi_account_id},
    )
    return data if isinstance(data, dict) else {}


async def send_risk_sms(lapi_account_id: str, *, proxy: dict | None = None) -> dict:
    """发送风控验证短信（同步；Header x-account-id）。返回 `{mobile}`（掩码手机号）。"""
    body: dict[str, Any] = {}
    if proxy:
        body["proxy"] = proxy
    data = await _request(
        "POST", "/api/web/platform-account/send-risk-sms-tasks",
        json_body=body or None, extra_headers={"x-account-id": lapi_account_id},
    )
    return data if isinstance(data, dict) else {}


async def confirm_risk(
    lapi_account_id: str,
    *,
    method: str,
    password: str | None = None,
    code_number: str | None = None,
    proxy: dict | None = None,
) -> dict:
    """解除发布风控（同步；Header x-account-id）。

    method=`password` 用社媒登录密码（`password`）；method=`smscode` 用短信验证码（`code_number`）。
    🔴 password 是用户社媒登录密码：**绝不落库**；日志由 `_safe_payload` 自动脱敏为 ***。
    """
    body: dict[str, Any] = {"type": method}
    if method == "password" and password:
        body["password"] = password
    if method == "smscode" and code_number:
        body["code_number"] = code_number
    if proxy:
        body["proxy"] = proxy
    data = await _request(
        "POST", "/api/web/platform-account/confirm-risk-tasks",
        json_body=body, extra_headers={"x-account-id": lapi_account_id},
    )
    return data if isinstance(data, dict) else {}


async def trigger_account_overview(
    lapi_account_id: str,
    *,
    callback_data: dict | None = None,
    proxy: dict | None = None,
) -> dict:
    headers_extra = {"x-account-id": lapi_account_id}
    body: dict[str, Any] = {}
    if proxy:
        body["proxy"] = proxy
    if callback_data:
        body["callBackData"] = callback_data
    return await _request(
        "POST",
        "/api/web/platform-account/overview-query-tasks",
        json_body=body or None,
        extra_headers=headers_extra,
    )


__all__ = [
    "LapiError",
    "LapiGatewayError",
    "LapiBusinessError",
    "start_cloud_authorization",
    "refresh_authorization",
    "get_remote_account",
    "list_remote_accounts",
    "revoke_remote_account",
    "submit_publish",
    "request_publish_result",
    "trigger_account_overview",
    "get_publish_categories",
    "get_author_info",
    "check_login_status",
    "get_publish_risk_status",
    "send_risk_sms",
    "confirm_risk",
    "is_login_expired",
    "is_proxy_error",
    "LAPI_LOGIN_EXPIRED_CODES",
    "UpstreamError",
]
