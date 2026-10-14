"""邮件发送（SMTP）。配置见 app.core.config 的 SMTP_* / .env。

用于发票开具后把电子发票通知发送到用户填写的「收票邮箱」。
失败仅记日志、返回 False，不抛异常、不阻塞主流程（与短信通知一致）。
"""
from __future__ import annotations

import logging
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_email(to_addr: str, subject: str, body: str, *, html: bool = False) -> bool:
    """发送一封邮件。返回是否成功；未配置 / 关闭 / 失败均返回 False（不抛）。"""
    host = (settings.SMTP_HOST or "").strip()
    user = (settings.SMTP_USER or "").strip()
    to = (to_addr or "").strip()
    if not to:
        return False
    if not settings.EMAIL_ENABLED:
        logger.info("[EMAIL] disabled, skip. to=%s subject=%s", to, subject)
        return False
    if not host or not user:
        logger.warning("[EMAIL] SMTP 未配置（SMTP_HOST/SMTP_USER 为空），跳过发送 to=%s", to)
        return False

    msg = EmailMessage()
    display_from = (settings.SMTP_FROM_NAME or "推量牛").strip()
    msg["From"] = f"{display_from} <{user}>"
    msg["To"] = to
    msg["Subject"] = subject
    if html:
        msg.set_content("请使用支持 HTML 的邮件客户端查看本邮件。")
        msg.add_alternative(body, subtype="html")
    else:
        msg.set_content(body)

    kwargs: dict = {
        "hostname": host,
        "port": int(settings.SMTP_PORT),
        "username": user,
        "password": settings.SMTP_PASSWORD or "",
        "timeout": int(settings.SMTP_TIMEOUT or 15),
    }
    # 465 走隐式 SSL；其它端口（如 587）走 STARTTLS
    if int(settings.SMTP_PORT) == 465:
        kwargs["use_tls"] = True
    else:
        kwargs["start_tls"] = True

    try:
        logger.info("[EMAIL-REQ] to=%s subject=%s via %s:%s", to, subject, host, settings.SMTP_PORT)
        # message 为 positional-only，必须位置传入
        await aiosmtplib.send(msg, **kwargs)
        logger.info("[EMAIL-OK] to=%s subject=%s", to, subject)
        return True
    except Exception:
        logger.exception("[EMAIL-FAIL] to=%s subject=%s", to, subject)
        return False


async def send_invoice_issued_email(
    *,
    to_addr: str,
    invoice_no: str,
    order_no: str,
    amount_yuan: int,
    title: str,
    file_url: str | None = None,
) -> bool:
    """发票开具完成邮件。"""
    subject = f"【推量牛】您的发票已开具（订单 {order_no}）"
    rows = [
        ("发票抬头", title or "—"),
        ("发票号码", invoice_no or "—"),
        ("对应订单", order_no or "—"),
        ("开票金额", f"¥{amount_yuan:,}"),
    ]
    items = "".join(
        f'<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">{k}</td>'
        f'<td style="padding:4px 0;color:#111827;font-weight:600;">{v}</td></tr>'
        for k, v in rows
    )
    download = (
        f'<p style="margin:16px 0;"><a href="{file_url}" '
        f'style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;'
        f'padding:10px 18px;border-radius:8px;">点此下载发票文件</a></p>'
        if file_url
        else ""
    )
    html = f"""\
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
  <h2 style="margin:0 0 8px;">发票已开具</h2>
  <p style="color:#374151;margin:0 0 16px;">您好，您申请的发票已开具，详情如下：</p>
  <table style="border-collapse:collapse;font-size:14px;">{items}</table>
  {download}
  <p style="color:#9ca3af;font-size:12px;margin-top:24px;">本邮件由系统自动发送，如有疑问请联系客服。</p>
</div>"""
    return await send_email(to_addr, subject, html, html=True)
