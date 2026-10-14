"""推量发 SDK 客户端 —— 通过 HTTPS Bearer 调用推量发网关 SDK API，
提供账号授权、账号同步、发布、账号指标、发布风控解除等能力。

主 backend 自己成为推量发的「默认子租户」，凭据：
    TLF_BASE_URL / TLF_APP_ID / TLF_APP_KEY  写在 backend/.env
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.exceptions import AppException

logger = logging.getLogger(__name__)


# ============ 异常 ============

class TlfError(AppException):
    def __init__(self, message: str = "推量发调用失败", code: int = 50302):
        super().__init__(code=code, message=message)


class TlfGatewayError(TlfError):
    def __init__(self, message: str = "推量发网关异常"):
        super().__init__(message=message, code=50302)


class TlfBusinessError(TlfError):
    def __init__(self, message: str, tlf_code: int, upstream_code: int | None = None):
        super().__init__(message=f"推量发返回错误 [{tlf_code}]：{message}", code=50303)
        self.tlf_code = tlf_code
        self.raw_message = message            # 未加前缀的原始 message（用于登录失效等特征识别）
        self.upstream_code = upstream_code    # 网关透出的上游原始码（data.upstream_code），可空


# 上游「登录态失效」识别：上游原始码 + message 特征（命中即该账号需重新扫码授权）
TLF_LOGIN_EXPIRED_UPSTREAM_CODES = {172403}
_LOGIN_EXPIRED_MARKERS = ("登录失效", "登录态", "未登录", "账号未登录", "登录已过期", "重新登录")


def is_login_expired(exc: Exception) -> bool:
    """判断推量发业务错误是否为账号登录态失效（需重新扫码），而非普通参数/内容错误。"""
    if not isinstance(exc, TlfBusinessError):
        return False
    try:
        if int(exc.upstream_code or 0) in TLF_LOGIN_EXPIRED_UPSTREAM_CODES:
            return True
    except (TypeError, ValueError):
        pass
    msg = getattr(exc, "raw_message", "") or getattr(exc, "message", "") or ""
    return any(m in msg for m in _LOGIN_EXPIRED_MARKERS)


def _upstream_code(payload: object) -> int | None:
    """从网关错误体的 data.upstream_code 取上游原始码（缺失/非法返回 None）。"""
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, dict) and data.get("upstream_code") is not None:
            try:
                return int(data["upstream_code"])
            except (TypeError, ValueError):
                return None
    return None


# ============ HTTP 通用 ============

def _resp_preview(text: str, limit: int = 500) -> str:
    return text if len(text) <= limit else text[:limit] + "...(truncated)"


def _exc_detail(exc: Exception, timeout: int) -> str:
    """异常可读详情：timeout 类异常 str() 常为空，必须带类名，否则日志一片空白。"""
    if isinstance(exc, httpx.TimeoutException):
        return f"请求超时（>{timeout}s，{type(exc).__name__}）"
    s = str(exc)
    return f"{type(exc).__name__}: {s}" if s else type(exc).__name__


def _safe_payload(payload: Any) -> Any:
    if not isinstance(payload, dict):
        return payload
    redacted = dict(payload)
    for k in list(redacted.keys()):
        if any(p in k.lower() for p in ("secret", "token", "password", "pwd", "key")):
            redacted[k] = "***"
    return redacted


async def _request(
    method: str,
    path: str,
    *,
    json_body: dict | None = None,
    params: dict | None = None,
) -> dict | list:
    """对推量发 SDK API 的薄 Bearer 调用。

    成功 → 返回 response.json()（推量发的 SDK 端点既可能是裸对象/list，也可能是 envelope）
    失败 → 抛 TlfGatewayError / TlfBusinessError
    """
    base_url = getattr(settings, "TLF_BASE_URL", "")
    app_key = getattr(settings, "TLF_APP_KEY", "")
    if not base_url or not app_key:
        raise TlfGatewayError("推量发配置缺失（TLF_BASE_URL / TLF_APP_KEY）")

    url = f"{base_url.rstrip('/')}{path}"
    headers = {"Authorization": f"Bearer {app_key}"}

    effective_body = json_body
    if effective_body is None and method.upper() in {"POST", "PUT", "PATCH"}:
        effective_body = {}
    if effective_body is not None:
        headers["Content-Type"] = "application/json"

    timeout = getattr(settings, "TLF_HTTP_TIMEOUT", 15)
    logger.info(
        "[TLF-REQ] %s %s | params=%s | body=%s",
        method, url, params, _safe_payload(effective_body),
    )
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.request(method, url, json=effective_body, params=params, headers=headers)
    except httpx.HTTPError as exc:
        elapsed_ms = int((time.monotonic() - started) * 1000)
        detail = _exc_detail(exc, timeout)
        logger.warning("[TLF-ERR] %s %s | %dms | 网络异常：%s", method, url, elapsed_ms, detail)
        raise TlfGatewayError(f"推量发接口网络异常：{detail}") from exc

    elapsed_ms = int((time.monotonic() - started) * 1000)
    logger.info("[TLF-RESP] %s | status=%s | %dms | body=%s",
                url, resp.status_code, elapsed_ms, _resp_preview(resp.text))
    if not 200 <= resp.status_code < 300:
        # 推量发的错误体是 {code, message, data}；把可读 message 透出给前端，
        # 而不是把整段 JSON 包成一句 HTTP 500（用户看不懂、像是崩溃）。
        try:
            err = resp.json()
        except json.JSONDecodeError:
            err = None
        if isinstance(err, dict) and err.get("message"):
            raise TlfBusinessError(
                str(err["message"]), int(err.get("code") or resp.status_code),
                upstream_code=_upstream_code(err),
            )
        raise TlfGatewayError(f"推量发返回 HTTP {resp.status_code}：{_resp_preview(resp.text, 200)}")

    try:
        body = resp.json()
    except json.JSONDecodeError as exc:
        raise TlfGatewayError(f"推量发响应非 JSON：{exc}") from exc

    # 兼容 envelope {code, message, data} 与裸对象
    if isinstance(body, dict) and "code" in body and "data" in body:
        code = body.get("code", -1)
        if code != 0:
            raise TlfBusinessError(
                str(body.get("message", "unknown")), int(code),
                upstream_code=_upstream_code(body),
            )
        return body.get("data") or {}
    return body


# ============ 业务：账号授权 ============

async def start_cloud_authorization(
    platform_code: str,
    *,
    callback_data: dict | None = None,
    password: str | None = None,
    region: str | None = None,
) -> dict:
    """发起授权。callBackData 由推量发自动注入 app_id（这里的 callback_data
    实为子租户自己的「外部 user_id」等附加信息，通过 external_user_id 字段透传）。

    region：用户选择的代理网络区域（推量发据此在该区域分配代理；不传则沿用上次/全局分配）。
    """
    body: dict[str, Any] = {"platform_code": platform_code}
    if password:
        body["password"] = password
    if callback_data and callback_data.get("user_id"):
        body["external_user_id"] = str(callback_data["user_id"])
    if region:
        body["region"] = region
    return await _request("POST", "/auth/start", json_body=body)


async def get_proxy_regions(external_user_id: str | None = None) -> dict:
    """取可选代理网络区域 + 该终端用户上次选择的区域（推量发 GET /proxy/regions）。

    返回 {regions: [...], last_selected_region: str|None}。external_user_id 即当前用户 id，
    用于回带其上次选择。"""
    params = {"external_user_id": external_user_id} if external_user_id else None
    data = await _request("GET", "/proxy/regions", params=params)
    if isinstance(data, dict):
        return data
    return {"regions": [], "last_selected_region": None}


async def get_remote_account(tlf_account_id: str) -> dict:
    """同步单账号：触发推量发从灵径拉最新状态并返回（snake_case：platform_user_name / platform_avatar / status）。"""
    return await _request("POST", f"/accounts/{tlf_account_id}/sync")  # type: ignore[return-value]


async def sync_accounts_batch(tlf_account_ids: list[str]) -> list[dict]:
    """批量同步账号：推量发逐账号并发检测登录态，返回账号信息数组（每项含 status/login_check 或
    失败项 {account_id, status:error, error}）。上限由网关 SYNC_BATCH_MAX_ACCOUNTS 控制。"""
    data = await _request("POST", "/accounts/sync-batch", json_body={"account_ids": tlf_account_ids})
    return data if isinstance(data, list) else []


async def list_remote_accounts(platform_code: str | None = None) -> list[dict]:
    """列出当前 app 已绑账号（推量发会按当前租户的 binding 过滤）。"""
    params = {"platform_code": platform_code} if platform_code else None
    data = await _request("GET", "/accounts", params=params)
    if isinstance(data, list):
        return data
    return []


async def revoke_remote_account(tlf_account_id: str) -> dict:
    """删除该租户的 mapping（推量发底层账号生命周期由管理员管理）。"""
    return await _request("DELETE", f"/accounts/{tlf_account_id}")  # type: ignore[return-value]


# ============ 业务：发布 ============

async def submit_publish(
    *,
    tlf_account_ids: list[str],
    content: dict,
    callback_data: dict | None = None,
    publish_type: str = "dynamic",
    sub_task_ids: list[str] | None = None,
    platform_code: str | None = None,
    extras: dict | None = None,
) -> dict:
    """提交发布到推量发。proxy 由推量发网关自行管理。

    sub_task_ids 必须透传给网关：webhook 回流时按子任务 ID 匹配本地 account_snapshot，
    本地与网关须用同一组 ID，否则结果无法回填。
    """
    title = content.get("title") or ""
    body_text = content.get("desc") or content.get("body") or ""
    # 注意：推量发网关 SDK 的契约字段名是 lapi_account_ids（网关侧保留 lapi 命名），
    # 不能跟随 backend 的 tlf 改名。这里 JSON key 必须用 lapi_account_ids。
    body: dict[str, Any] = {
        "platform_code": platform_code or "",
        "lapi_account_ids": tlf_account_ids,
        "publish_kind": publish_type,
        "title": title,
        "body": body_text,
    }
    if sub_task_ids:
        body["sub_task_ids"] = sub_task_ids
    if callback_data:
        # 透传子租户自己的关联标识（如 task_id / user_id / content_id），推量发会原样回传 webhook
        body["external_content_id"] = (
            callback_data.get("task_id")
            or callback_data.get("content_id")
            or callback_data.get("external_content_id")
        )
    if content.get("videoUrl"):
        body["video_url"] = content["videoUrl"]
    if content.get("covers"):
        body["cover_urls"] = [c if isinstance(c, str) else c.get("pathOrUrl") for c in content["covers"]]
    if content.get("mediaUrls"):
        body["media_urls"] = [m if isinstance(m, str) else m.get("pathOrUrl") for m in content["mediaUrls"]]
    if content.get("content"):
        body["html_content"] = content["content"]
    if extras:
        for k, v in extras.items():
            if v is not None and v != "" and v != []:
                body[k] = v
    return await _request("POST", "/publish", json_body=body)  # type: ignore[return-value]


# ============ 业务：账号指标 ============

async def trigger_account_overview(
    tlf_account_id: str,
    *,
    callback_data: dict | None = None,  # noqa: ARG001
) -> dict:
    return await _request("POST", f"/metrics/accounts/{tlf_account_id}/refresh")  # type: ignore[return-value]


async def get_categories(tlf_account_id: str, publish_kind: str) -> list:
    """获取账号某发布类型的内容分类树（部分平台发布必填，如哔哩哔哩视频）。"""
    data = await _request(
        "GET", f"/accounts/{tlf_account_id}/categories",
        params={"publish_kind": publish_kind},
    )
    if isinstance(data, dict):
        return data.get("categories") or []
    return data or []  # type: ignore[return-value]


# ============ 业务：抖音发布风控解除 ============

async def get_risk_status(tlf_account_id: str) -> dict:
    """获取账号发布风控状态（支持抖音）。返回 {risk_status, check_methods}。"""
    data = await _request("GET", f"/accounts/{tlf_account_id}/risk-status")
    return data if isinstance(data, dict) else {}


async def send_risk_sms(tlf_account_id: str) -> dict:
    """发送风控验证短信。返回 {mobile}（掩码手机号）。"""
    data = await _request("POST", f"/accounts/{tlf_account_id}/risk-sms")
    return data if isinstance(data, dict) else {}


async def confirm_risk(
    tlf_account_id: str, *, method: str, password: str | None = None, code: str | None = None
) -> dict:
    """解除发布风控。method=password 用登录密码；method=smscode 用短信验证码。

    🔴 password 仅透传，**不落库、不记录日志**。
    """
    body: dict = {"method": method}
    if password is not None:
        body["password"] = password
    if code is not None:
        body["code"] = code
    data = await _request("POST", f"/accounts/{tlf_account_id}/risk-confirm", json_body=body)
    return data if isinstance(data, dict) else {}


__all__ = [
    "TlfError",
    "TlfGatewayError",
    "TlfBusinessError",
    "start_cloud_authorization",
    "get_remote_account",
    "get_categories",
    "list_remote_accounts",
    "revoke_remote_account",
    "submit_publish",
    "trigger_account_overview",
]
