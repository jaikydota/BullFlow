"""订阅 / 计费相关 Pydantic schemas（C 端 API 使用）。"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import UtcDateTime


# ---------------- 套餐 ----------------

class PlanOut(BaseModel):
    id: str
    slug: str
    name: str
    # 多周期定价：月付价必有；季付 / 年付为已解析的有效价，未启用则为 None
    monthly_price_cents: int
    quarterly_price_cents: int | None = None
    yearly_price_cents: int | None = None
    status: Literal["active", "inactive"]
    # 档位：越大越高档（free=0）；前端据此判断"只能升级到更高档位"
    tier: int = 0
    points_quota: int
    storage_gb: int
    domestic_accounts: int
    overseas_accounts: int
    features: list[str] = []


class AddonOut(BaseModel):
    """增量包（加包）公开信息。"""

    id: str
    slug: str
    name: str
    addon_type: Literal["points", "storage", "domestic_account", "overseas_account"]
    unit_label: str
    price_cents: int
    # 单份发放数量（语义随类型：积分数 / GB / 账号数）
    quota_amount: int = 0
    sort_order: int = 0


# ---------------- 升降级预计算 ----------------

class QuoteOut(BaseModel):
    target_plan_slug: str
    target_price_cents: int
    current_plan_slug: str | None = None
    current_price_cents: int = 0
    remaining_days: int = 0
    # 当前订阅剩余价值（按已付价 × 剩余天数比例）
    remaining_value_cents: int = 0
    # 本次实际应付（max(0, target - remaining_value)）
    payable_cents: int
    action: Literal["new", "upgrade", "downgrade", "renew"]
    # 文案提示，前端可直接展示
    note: str | None = None


# ---------------- 订单 ----------------

PayMethodLiteral = Literal["alipay", "wechat", "transfer"]
OrderStatusLiteral = Literal["pending", "reviewing", "paid", "cancelled", "refunded"]


class OrderCreatePayload(BaseModel):
    plan_slug: str = Field(..., description="目标套餐 slug")
    billing_period: Literal["month", "quarter", "year"] = Field(
        "month", description="计费周期：月付 / 季付 / 年付"
    )
    pay_method: PayMethodLiteral = Field(..., description="alipay 或 wechat")


class AddonOrderCreatePayload(BaseModel):
    addon_slug: str = Field(..., description="增量包 slug")
    quantity: int = Field(1, ge=1, le=99, description="购买份数")
    pay_method: PayMethodLiteral = Field(..., description="alipay 或 wechat")


class OrderCreateResult(BaseModel):
    order_no: str
    plan_slug: str | None = None       # 套餐订单
    addon_slug: str | None = None      # 加包订单
    quantity: int | None = None        # 加包购买份数
    amount_cents: int
    pay_method: PayMethodLiteral
    pay_type_code: str          # A01 / W01 ...
    qrcode_url: str | None = None  # 通联返回 payinfo，前端展示二维码
    expires_at: UtcDateTime
    status: OrderStatusLiteral
    # 若 payable_cents == 0（差价为 0），后端直接激活订阅，前端可看 status=paid
    auto_activated: bool = False


class OrderOut(BaseModel):
    order_no: str
    plan_slug: str | None = None
    addon_slug: str | None = None
    order_type: Literal["subscription", "recharge", "value_added"]
    amount_cents: int
    pay_method: str
    pay_channel: str | None = None
    pay_type_code: str | None = None
    status: OrderStatusLiteral
    qrcode_url: str | None = None
    # 对公转账：用户上传的凭证 URL + 驳回原因/核销备注（复用 remark 字段）
    voucher_url: str | None = None
    remark: str | None = None
    description: str | None = None
    expires_at: UtcDateTime | None = None
    paid_at: UtcDateTime | None = None
    created_at: UtcDateTime


# ---------------- 对公转账 ----------------

class TransferConfigOut(BaseModel):
    """对公转账收款账户信息（C 端展示用）。"""

    enabled: bool = False
    company_name: str = ""
    account_name: str = ""
    account_number: str = ""
    bank_name: str = ""
    bank_branch: str = ""
    remark_tip: str = ""


class TransferSubmitPayload(BaseModel):
    """用户「我已转账」提交核销（凭证可选）。"""

    voucher_url: str | None = Field(None, description="转账凭证图片 URL（可选）")
    remark: str | None = Field(None, max_length=500, description="备注（可选）")


# ---------------- 发票 ----------------

InvoiceStatusLiteral = Literal["pending", "issued", "rejected", "voided"]
InvoiceTitleTypeLiteral = Literal["personal", "company"]
InvoiceKindLiteral = Literal["normal", "special"]


class InvoiceApplyPayload(BaseModel):
    """用户对已支付订单申请开票。"""

    title_type: InvoiceTitleTypeLiteral = Field(..., description="抬头类型：个人 / 企业")
    title: str = Field(..., min_length=1, max_length=255, description="发票抬头")
    tax_no: str | None = Field(None, max_length=64, description="税号（企业必填）")
    invoice_kind: InvoiceKindLiteral = Field(..., description="发票类型：普票 / 专票")
    # 专票专属（专票必填）
    reg_address: str | None = Field(None, max_length=255, description="注册地址（专票）")
    reg_phone: str | None = Field(None, max_length=32, description="注册电话（专票）")
    bank_name: str | None = Field(None, max_length=128, description="开户行（专票）")
    bank_account: str | None = Field(None, max_length=64, description="银行账号（专票）")
    email: str | None = Field(None, max_length=255, description="收票邮箱")

    @model_validator(mode="after")
    def _validate(self) -> "InvoiceApplyPayload":
        if self.title_type == "company" and not (self.tax_no and self.tax_no.strip()):
            raise ValueError("企业抬头必须填写税号")
        if self.invoice_kind == "special":
            missing = [
                label
                for label, val in (
                    ("注册地址", self.reg_address),
                    ("注册电话", self.reg_phone),
                    ("开户行", self.bank_name),
                    ("银行账号", self.bank_account),
                )
                if not (val and val.strip())
            ]
            if missing:
                raise ValueError("专票需填写：" + "、".join(missing))
        if self.email and self.email.strip():
            import re

            if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", self.email.strip()):
                raise ValueError("收票邮箱格式不正确")
        return self


class InvoiceOut(BaseModel):
    id: str
    order_no: str
    status: InvoiceStatusLiteral
    title_type: InvoiceTitleTypeLiteral
    title: str
    tax_no: str | None = None
    invoice_kind: InvoiceKindLiteral
    reg_address: str | None = None
    reg_phone: str | None = None
    bank_name: str | None = None
    bank_account: str | None = None
    email: str | None = None
    amount_cents: int
    invoice_no: str | None = None
    invoice_file_url: str | None = None
    issued_at: UtcDateTime | None = None
    reject_reason: str | None = None
    created_at: UtcDateTime
