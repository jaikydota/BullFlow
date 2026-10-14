"""通联支付 AllinPay 客户端。

接入文档：
- 统一支付 API：https://prodoc.allinpay.com/doc/256/   POST /apiweb/unitorder/pay
- 统一查询 API：doc/259                              POST /apiweb/unitorder/query
- 统一退款 API：doc/2329                             POST /apiweb/unitorder/refund

签名：见 app/utils/allinpay_sign.py（SHA1WithRSA）。
日志规范：参考 sms_service.py，[ALLINPAY-REQ] / [ALLINPAY-RESP] / [ALLINPAY-ERR]。
"""
from __future__ import annotations

import logging
import secrets
import string
from typing import Any

import httpx

from app.core.config import settings
from app.core.exceptions import AppException
from app.utils.allinpay_sign import build_sign

logger = logging.getLogger(__name__)


class AllinpayError(AppException):
    def __init__(self, message: str = "支付网关异常，请稍后重试", data: Any = None):
        super().__init__(code=50301, message=message, data=data)


def _resp_preview(text: str, limit: int = 500) -> str:
    return text if len(text) <= limit else text[:limit] + "...(truncated)"


def _mask(payload: dict[str, Any]) -> dict[str, Any]:
    masked = dict(payload)
    if "sign" in masked and isinstance(masked["sign"], str):
        masked["sign"] = masked["sign"][:8] + "***"
    return masked


def _random_str(length: int = 32) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class AllinpayClient:
    """通联支付 HTTP 客户端（线程安全、可作 settings 级单例）。"""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        cusid: str | None = None,
        appid: str | None = None,
        private_key: str | None = None,
        sign_type: str | None = None,
        timeout: int | None = None,
    ) -> None:
        self.base_url = (base_url or settings.ALLINPAY_BASE_URL).rstrip("/")
        self.cusid = cusid or settings.ALLINPAY_CUSID
        self.appid = appid or settings.ALLINPAY_APPID
        self.private_key = private_key or settings.ALLINPAY_PRIVATE_KEY
        self.sign_type = sign_type or settings.ALLINPAY_SIGN_TYPE
        self.timeout = timeout or settings.ALLINPAY_HTTP_TIMEOUT

    # -------------------- 内部 --------------------

    def _base_payload(self, reqsn: str) -> dict[str, Any]:
        if not (self.cusid and self.appid):
            raise AllinpayError("通联商户号 / 应用 ID 未配置")
        return {
            "cusid": self.cusid,
            "appid": self.appid,
            "version": "11",
            "randomstr": _random_str(32),
            "signtype": self.sign_type,
            "reqsn": reqsn,
        }

    def _sign(self, payload: dict[str, Any]) -> dict[str, Any]:
        payload["sign"] = build_sign(payload, self.private_key, sign_type=self.sign_type)
        return payload

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        logger.info("[ALLINPAY-REQ] %s | payload=%s", url, _mask(payload))
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # 通联接口使用 application/x-www-form-urlencoded
                resp = await client.post(
                    url,
                    data=payload,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
        except (httpx.ConnectTimeout, httpx.ConnectError, httpx.ReadTimeout) as exc:
            logger.error("[ALLINPAY-NET] %s | %s", url, exc)
            raise AllinpayError("无法连接通联网关")
        logger.info(
            "[ALLINPAY-RESP] %s | status=%s body=%s",
            url,
            resp.status_code,
            _resp_preview(resp.text),
        )
        if resp.status_code != 200:
            raise AllinpayError(f"通联返回 HTTP {resp.status_code}")
        try:
            data = resp.json()
        except ValueError:
            logger.error("[ALLINPAY-ERR] non-JSON response: %s", _resp_preview(resp.text))
            raise AllinpayError("通联响应解析失败")
        return data

    # -------------------- 公开方法 --------------------

    async def unified_order(
        self,
        *,
        order_no: str,
        amount_cents: int,
        paytype: str,
        body: str,
        notify_url: str | None = None,
        validtime_minutes: int = 30,
        remark: str | None = None,
    ) -> dict[str, Any]:
        """统一下单。返回原始字典，需关注 retcode / trxid / payinfo。

        通联文档 doc/256 字段定义（关键容易错的点）：
        - `trxamt`：数值（字符串数字），单位**分**
        - `paytype`：3 位，A01=支付宝主扫，W01=微信主扫
        - `body`：≤ 100 字节，UTF-8 下中文 3 字节
        - `validtime`：**数值，单位分钟**，最长 4 位（≤ 9999 min）；不填默认 5 分钟
        - `expiretime`：绝对时间字符串 yyyyMMddHHmmss（与 validtime 二选一）
        - `notify_url`：必须直接可达 URL，不能携带参数，长度 ≤ 256
        - `remark`：禁止包含 `+ 空格 / ? % # & =`
        """
        if validtime_minutes < 1 or validtime_minutes > 9999:
            raise ValueError("validtime_minutes 必须在 1-9999 之间")
        payload = self._base_payload(reqsn=order_no)
        payload.update(
            {
                "trxamt": str(amount_cents),
                "paytype": paytype,
                "body": body,
                "validtime": str(validtime_minutes),
                "notify_url": notify_url or settings.ALLINPAY_NOTIFY_URL,
            }
        )
        if remark:
            payload["remark"] = remark
        self._sign(payload)
        data = await self._post("/apiweb/unitorder/pay", payload)
        if str(data.get("retcode", "")).upper() != "SUCCESS":
            raise AllinpayError(
                f"通联下单失败：{data.get('retmsg') or data.get('errmsg') or data}"
            )
        return data

    async def query_order(self, *, order_no: str) -> dict[str, Any]:
        """查询订单。"""
        payload = self._base_payload(reqsn=order_no)
        self._sign(payload)
        data = await self._post("/apiweb/unitorder/query", payload)
        return data

    async def refund(
        self,
        *,
        original_order_no: str,
        refund_order_no: str,
        refund_amount_cents: int,
        reason: str | None = None,
    ) -> dict[str, Any]:
        """退款。original_order_no 为原订单 reqsn，refund_order_no 为本次退款流水。"""
        payload = self._base_payload(reqsn=refund_order_no)
        payload.update(
            {
                "oldreqsn": original_order_no,
                "trxamt": str(refund_amount_cents),
            }
        )
        if reason:
            payload["remark"] = reason
        self._sign(payload)
        data = await self._post("/apiweb/unitorder/refund", payload)
        if str(data.get("retcode", "")).upper() != "SUCCESS":
            raise AllinpayError(
                f"通联退款失败：{data.get('retmsg') or data.get('errmsg') or data}"
            )
        return data


# 单例
allinpay_client = AllinpayClient()
