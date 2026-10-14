"""梦网国际短信平台客户端

API 文档：参考梦网国际短信平台 API 说明 V5.18.1

鉴权算法：
    pwd = sha256(UPPER(userid) + "00000000" + password + timestamp).hex
    timestamp 为 MMDDHHMMSS 10 位字符串（当前时间，不含年）

请求格式：POST + application/json
content 字段必须 urlencode(UTF-8)
mobile 字段为 国码+号码 不含 +，如 8613800138000

单发：/sms/v2/std/message            返回 {result, desc, msgid, custid}
批量：/sms/v2/std/batchmessage       返回 {result, desc, messages: [{mobile, msgid}]}
result == 0 表示成功，否则 desc 中含错误说明（urlencoded）
"""
from __future__ import annotations

import hashlib
import logging
import urllib.parse
from datetime import datetime
from typing import Any

import httpx

from app.core.config import settings
from app.core.exceptions import AppException


logger = logging.getLogger(__name__)


# ---- 短信文案模板 ----

SMS_TEMPLATES = {
    "register": "您的注册验证码是：{code}，5 分钟内有效，请勿泄露。",
    "login": "您的登录验证码是：{code}，5 分钟内有效，请勿泄露。",
    "reset_password": "您正在重置密码，验证码：{code}，5 分钟内有效。",
}


class SmsSendError(AppException):
    """短信发送失败"""

    def __init__(self, message: str = "短信发送失败，请稍后再试"):
        super().__init__(code=50301, message=message)


def _now_timestamp() -> str:
    """返回梦网鉴权所需的时间戳，格式 MMDDHHMMSS。"""
    return datetime.now().strftime("%m%d%H%M%S")


def _sign(userid: str, password: str, timestamp: str) -> str:
    """梦网鉴权签名：sha256(UPPER(userid) + "00000000" + password + timestamp)"""
    raw = userid.upper() + "00000000" + password + timestamp
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def render_template(purpose: str, code: str) -> str:
    """渲染验证码短信全文，含签名前缀。"""
    body = SMS_TEMPLATES.get(purpose, SMS_TEMPLATES["register"]).format(code=code)
    return f"{settings.SMS_SIGNATURE} {body}"


def _resp_preview(text: str, limit: int = 500) -> str:
    return text if len(text) <= limit else text[:limit] + "...(truncated)"


async def _post(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    """通用 POST，统一日志规范（见 backend/AGENTS.md §9.1.3）"""
    safe_payload = {**payload, "pwd": "***"}
    logger.info("[SMS-REQ] %s | payload=%s", url, safe_payload)
    try:
        async with httpx.AsyncClient(timeout=settings.SMS_HTTP_TIMEOUT) as client:
            resp = await client.post(url, json=payload, headers={"Content-Type": "application/json"})
    except (httpx.ConnectTimeout, httpx.ConnectError) as exc:
        logger.error("[SMS-NET] 连接短信网关失败：%s | %s", url, exc)
        raise SmsSendError(
            "短信网关连接失败，请检查网络连通性、防火墙及短信平台 IP 白名单"
        ) from exc
    except (httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout) as exc:
        logger.error("[SMS-NET] 短信网关读写超时：%s | %s", url, exc)
        raise SmsSendError("短信网关响应超时，请稍后重试") from exc
    except httpx.HTTPError as exc:
        logger.error("[SMS-NET] 短信网关请求异常：%s | %s", url, exc)
        raise SmsSendError(f"短信网关请求失败：{exc}") from exc

    logger.info("[SMS-RESP] %s | status=%s | body=%s", url, resp.status_code, _resp_preview(resp.text))
    if resp.status_code != 200:
        raise SmsSendError(f"短信网关返回 HTTP {resp.status_code}")
    try:
        data = resp.json()
    except Exception as exc:
        raise SmsSendError(f"短信网关响应解析失败: {exc}") from exc
    return data


async def send_sms(phone: str, content: str) -> dict[str, Any]:
    """单发短信。

    Args:
        phone: 国码+号码（不含 +），如 8613800138000 / 85292041234
        content: 短信正文（含签名）。函数内会做 urlencode。

    Returns:
        梦网网关原始响应 dict
    """
    if not settings.SMS_ENABLED:
        logger.info("[SMS-DEV] SMS_ENABLED=false，跳过发送。phone=%s content=%s", phone, content)
        return {"result": 0, "desc": "dev-mode-skip", "msgid": 0}

    if not settings.SMS_PROVIDER_USERID or not settings.SMS_PROVIDER_PWD:
        raise SmsSendError("梦网账号未配置（SMS_PROVIDER_USERID / SMS_PROVIDER_PWD）")

    ts = _now_timestamp()
    payload = {
        "userid": settings.SMS_PROVIDER_USERID,
        "pwd": _sign(settings.SMS_PROVIDER_USERID, settings.SMS_PROVIDER_PWD, ts),
        "mobile": phone,
        "content": urllib.parse.quote(content, encoding="utf-8"),
        "timestamp": ts,
    }
    data = await _post(settings.SMS_SINGLE_URL, payload)

    result = data.get("result")
    if result != 0:
        desc = urllib.parse.unquote(str(data.get("desc", "")))
        logger.warning("[SMS-FAIL] phone=%s result=%s desc=%s", phone, result, desc)
        raise SmsSendError(f"短信发送失败（{result}）：{desc or '未知错误'}")

    logger.info("[SMS-OK] phone=%s msgid=%s", phone, data.get("msgid"))
    return data


async def send_sms_batch(phones: list[str], content: str) -> dict[str, Any]:
    """批量发送（最多 1000 个号码）。

    Args:
        phones: 号码列表，每个为 国码+号码 不含 +
        content: 短信正文（含签名）
    """
    if not phones:
        raise SmsSendError("手机号列表为空")
    if len(phones) > 1000:
        raise SmsSendError("单次批量发送上限 1000 个号码")

    if not settings.SMS_ENABLED:
        logger.info("[SMS-DEV-BATCH] 跳过发送。count=%d content=%s", len(phones), content)
        return {"result": 0, "desc": "dev-mode-skip", "messages": [{"mobile": p, "msgid": 0} for p in phones]}

    ts = _now_timestamp()
    payload = {
        "userid": settings.SMS_PROVIDER_USERID,
        "pwd": _sign(settings.SMS_PROVIDER_USERID, settings.SMS_PROVIDER_PWD, ts),
        "mobile": ",".join(phones),
        "content": urllib.parse.quote(content, encoding="utf-8"),
        "timestamp": ts,
    }
    data = await _post(settings.SMS_BATCH_URL, payload)

    if data.get("result") != 0:
        desc = urllib.parse.unquote(str(data.get("desc", "")))
        logger.warning("[SMS-BATCH-FAIL] count=%d result=%s desc=%s", len(phones), data.get("result"), desc)
        raise SmsSendError(f"批量短信发送失败：{desc or '未知错误'}")

    return data


async def send_verification_code(phone: str, code: str, purpose: str) -> None:
    """发送验证码短信。

    Args:
        phone: E.164 不含 + 的手机号
        code: 6 位数字验证码
        purpose: register / login / reset_password
    """
    content = render_template(purpose, code)
    await send_sms(phone, content)
