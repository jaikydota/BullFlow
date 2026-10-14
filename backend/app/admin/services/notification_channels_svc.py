from __future__ import annotations

import base64
import hashlib
import hmac
import time
from email.message import EmailMessage
from typing import Any

import aiosmtplib
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError
from app.admin.schemas.notification_channels import (
    FeishuChannelConfig,
    NotificationChannelsBody,
    NotificationChannelTestBody,
    SmtpChannelConfig,
    WecomChannelConfig,
)
from app.admin.services import platform_settings_svc

SETTINGS_KEY = "notification_channels"


def _deep_merge_channels(raw: Any) -> NotificationChannelsBody:
    """与前端 `mergePayload` 行为对齐：缺省字段补齐。"""
    if raw is None:
        return NotificationChannelsBody()
    if isinstance(raw, list):
        return NotificationChannelsBody()
    if not isinstance(raw, dict):
        return NotificationChannelsBody()
    try:
        return NotificationChannelsBody.model_validate(raw)
    except Exception:
        return NotificationChannelsBody()


async def get_channels_model(db: AsyncSession) -> NotificationChannelsBody:
    settings = await platform_settings_svc.get_all_settings(db)
    raw = settings.get(SETTINGS_KEY)
    return _deep_merge_channels(raw)


async def put_channels(db: AsyncSession, body: NotificationChannelsBody, operator_id: str) -> NotificationChannelsBody:
    data = body.model_dump(mode="json", by_alias=True)
    await platform_settings_svc.update_settings_partial(db, {SETTINGS_KEY: data}, operator_id)
    return await get_channels_model(db)


async def run_channel_test(db: AsyncSession, body: NotificationChannelTestBody) -> dict[str, Any]:
    cfg = await get_channels_model(db)

    if body.channel == "smtp":
        return await _test_smtp(cfg.smtp, body.to_email)
    if body.channel == "feishu":
        return await _test_feishu(cfg.feishu)
    if body.channel == "wecom":
        return await _test_wecom(cfg.wecom, body.touser)
    raise BadRequestError("不支持的 channel")


async def _test_smtp(smtp: SmtpChannelConfig, to_email: str | None) -> dict[str, Any]:
    host = (smtp.host or "").strip()
    user = (smtp.user or "").strip()
    password = smtp.pass_ or ""
    if not host or not user:
        raise BadRequestError("请填写 SMTP 服务器与用户名")

    try:
        port = int((smtp.port or "465").strip() or "465")
    except ValueError as e:
        raise BadRequestError("SMTP 端口无效") from e

    to_addr = (to_email or "").strip() or user
    msg = EmailMessage()
    display_from = (smtp.senderName or "").strip() or "Matrix365"
    msg["From"] = f"{display_from} <{user}>"
    msg["To"] = to_addr
    msg["Subject"] = "Matrix365 通知渠道测试"
    msg.set_content("这是一封来自管理后台的 SMTP 连通性测试邮件。")

    kwargs: dict[str, Any] = {
        "hostname": host,
        "port": port,
        "username": user,
        "password": password,
    }
    if port == 465:
        kwargs["use_tls"] = True
    else:
        kwargs["start_tls"] = True

    try:
        # message 为 positional-only，必须位置传入
        await aiosmtplib.send(msg, **kwargs)
    except Exception as e:
        raise BadRequestError(f"SMTP 发送失败: {e!s}") from e

    return {"ok": True, "detail": "已发送测试邮件", "to": to_addr}


async def _test_feishu(feishu: FeishuChannelConfig) -> dict[str, Any]:
    hook = (feishu.webhook or "").strip()
    if not hook:
        raise BadRequestError("请填写飞书 Webhook")

    text = "Matrix365 管理后台：飞书通知渠道测试消息"
    payload: dict[str, Any] = {"msg_type": "text", "content": {"text": text}}
    secret = (feishu.secret or "").strip()
    if secret:
        ts = str(int(time.time()))
        string_to_sign = f"{ts}\n{secret}"
        sign = base64.b64encode(
            hmac.new(secret.encode("utf-8"), string_to_sign.encode("utf-8"), digestmod=hashlib.sha256).digest()
        ).decode("utf-8")
        payload["timestamp"] = ts
        payload["sign"] = sign

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(hook, json=payload)
            if r.status_code >= 400:
                raise BadRequestError(f"飞书 Webhook 返回 HTTP {r.status_code}: {r.text[:500]}")
            try:
                data = r.json()
            except Exception:
                return {"ok": True, "detail": "已请求 Webhook", "httpStatus": r.status_code}
            if isinstance(data, dict) and data.get("code") not in (None, 0):
                raise BadRequestError(f"飞书接口错误: {data}")
    except BadRequestError:
        raise
    except Exception as e:
        raise BadRequestError(f"飞书请求失败: {e!s}") from e

    return {"ok": True, "detail": "已通过 Webhook 发送测试消息"}


async def _test_wecom(wecom: WecomChannelConfig, touser: str | None) -> dict[str, Any]:
    corpid = (wecom.corpid or "").strip()
    secret = (wecom.secret or "").strip()
    agent_raw = (wecom.agentid or "").strip()
    if not corpid or not secret or not agent_raw:
        raise BadRequestError("请填写 CorpID、AgentID 与 Secret")

    try:
        agentid = int(agent_raw)
    except ValueError as e:
        raise BadRequestError("AgentID 必须为数字") from e

    tu = (touser or "").strip() or "@all"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            tr = await client.get(
                "https://qyapi.weixin.qq.com/cgi-bin/gettoken",
                params={"corpid": corpid, "corpsecret": secret},
            )
            tr.raise_for_status()
            tok = tr.json()
            if tok.get("errcode") not in (None, 0):
                raise BadRequestError(f"获取 access_token 失败: {tok}")
            token = tok.get("access_token")
            if not token:
                raise BadRequestError("企业微信未返回 access_token")

            send_body = {
                "touser": tu,
                "msgtype": "text",
                "agentid": agentid,
                "text": {"content": "Matrix365 管理后台：企业微信通知渠道测试"},
            }
            sr = await client.post(
                f"https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token={token}",
                json=send_body,
            )
            sr.raise_for_status()
            out = sr.json()
            if out.get("errcode") not in (None, 0):
                raise BadRequestError(f"企业微信发送失败: {out}")
    except BadRequestError:
        raise
    except Exception as e:
        raise BadRequestError(f"企业微信请求失败: {e!s}") from e

    return {"ok": True, "detail": "已通过应用消息接口发送测试", "touser": tu}
