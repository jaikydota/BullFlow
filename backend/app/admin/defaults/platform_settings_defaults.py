"""Default keys for PlatformSetting (merged on first read)."""

from __future__ import annotations
from app.admin.defaults.billing_defaults import BILLING_CONFIGURATION_DEFAULT

SETTINGS_DEFAULTS: dict[str, object] = {
    "notification_channels": [],
    "billing_configuration": BILLING_CONFIGURATION_DEFAULT,
    "system_preferences": {
        "site_name": "Matrix365 Admin",
        "maintenance_mode": False,
        "support_email": "",
        "platform_logo_url": "",
        "favicon_url": "",
    },
    "top_banners": [],
    "top_notices": [],
    # 注册策略：可选指向某个"积分类增量包"作为新用户欢迎礼物
    # welcome_addon_id 为空 / null 表示不赠送（仍按 ensure_free_subscription 绑定 Free 套餐）
    # 邀请有礼：referral_register_addon_id=被邀请人注册时发给邀请人的一阶奖励；
    #          referral_recharge_addon_id=被邀请人首次充值时发给邀请人的二阶奖励（null 则前端不展示二阶）
    "registration_strategy": {
        "welcome_addon_id": None,
        "referral_register_addon_id": None,
        "referral_recharge_addon_id": None,
    },
    # 对公转账收款账户（用户下单选「对公转账」时展示；enabled=False 则前端不提供该支付方式）
    "transfer_settings": {
        "enabled": False,
        "company_name": "",
        "account_name": "",
        "account_number": "",
        "bank_name": "",
        "bank_branch": "",
        "remark_tip": "",
    },
    # 财务短信通知：用户发起对公转账核销 / 开票申请时，给所有有手机号的财务发短信提醒上平台审核
    "finance_sms_notification": {
        "enabled": False,
        "transfer_notification": True,
        "invoice_notification": True,
    },
}
