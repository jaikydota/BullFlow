from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SmtpChannelConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool = False
    host: str = ""
    port: str = "465"
    user: str = ""
    pass_: str = Field(default="", alias="pass")
    senderName: str = ""


class FeishuChannelConfig(BaseModel):
    enabled: bool = False
    webhook: str = ""
    secret: str = ""


class WecomChannelConfig(BaseModel):
    enabled: bool = False
    corpid: str = ""
    agentid: str = ""
    secret: str = ""


class NotificationChannelsBody(BaseModel):
    smtp: SmtpChannelConfig = Field(default_factory=SmtpChannelConfig)
    feishu: FeishuChannelConfig = Field(default_factory=FeishuChannelConfig)
    wecom: WecomChannelConfig = Field(default_factory=WecomChannelConfig)


class NotificationChannelTestBody(BaseModel):
    channel: Literal["smtp", "feishu", "wecom"]
    """测试 SMTP 时若缺省则向 `smtp.user` 发一封测试邮件。"""
    to_email: str | None = None
    """企业微信接收用户 ID；缺省为 @all（需企业内权限策略允许）。"""
    touser: str | None = None
