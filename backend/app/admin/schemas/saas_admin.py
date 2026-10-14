from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class AdminPlanPayload(BaseModel):
    slug: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=255)
    # 多周期定价（元，服务端存为分）：月付价必填；季付 / 年付各有启用开关 + 可空自定义价
    monthly_price_yuan: int = Field(..., ge=0, description="月付价（元，必填）")
    quarterly_enabled: bool = Field(False, description="是否出售季付")
    quarterly_price_yuan: int | None = Field(None, ge=0, description="季付自定义价；空=月付×3")
    yearly_enabled: bool = Field(False, description="是否出售年付")
    yearly_price_yuan: int | None = Field(None, ge=0, description="年付自定义价；空=月付×12")
    status: str = Field("active", pattern=r"^(active|inactive)$")
    tier: int = Field(0, ge=0, description="档位，越大越高档（free=0）；排序 + 升级判断用")
    points_quota: int = Field(0, ge=0)
    storage_gb: int = Field(0, ge=0)
    domestic_accounts: int = Field(0, ge=0)
    overseas_accounts: int = Field(0, ge=0)
    features: list[str] = Field(default_factory=list)


class AdminPlanOut(BaseModel):
    id: str
    slug: str
    name: str
    # 「元」整数，前端展示用；季付 / 年付自定义价为 None 表示走默认（月付×3 / ×12）
    monthlyPrice: int
    quarterlyEnabled: bool
    quarterlyPrice: int | None = None
    yearlyEnabled: bool
    yearlyPrice: int | None = None
    status: str
    tier: int = 0
    pointsQuota: int
    storageGB: int
    domesticAccounts: int
    overseasAccounts: int
    features: list[str]

    model_config = {"from_attributes": False}


class AdminAddonPayload(BaseModel):
    slug: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=255)
    type: str = Field(
        ...,
        pattern=r"^(points|storage|domestic_account|overseas_account)$",
    )
    unit: str = Field(..., min_length=1, max_length=255)
    price_yuan: int = Field(..., ge=0)
    points_quota: int = Field(0, ge=0, description="单份发放数量（语义随类型：积分数 / GB / 账号数）")
    sort_order: int = Field(0, ge=0, description="展示排序，越小越靠前")
    status: str = Field("active", pattern=r"^(active|inactive)$")


class AdminAddonOut(BaseModel):
    id: str
    slug: str
    name: str
    type: str
    unit: str
    price: int
    pointsQuota: int = 0
    sortOrder: int = 0
    status: str


class AdminOrderCreate(BaseModel):
    user_id: str = Field(..., description="租户主账号 UUID 字符串")
    tenant_display_name: str | None = None
    order_type: str = Field(..., pattern=r"^(subscription|recharge|value_added)$")
    amount_yuan: int = Field(..., ge=0)
    pay_method: str = Field(
        ...,
        pattern=r"^(alipay|wechat|stripe|paypal|transfer|offline)$",
    )
    description: str | None = None
    plan_slug: str | None = None


class AdminSubscriptionGrant(BaseModel):
    """内部开通套餐：建一条已支付订单并激活订阅。"""

    user_id: str = Field(..., description="目标用户 users.id")
    plan_slug: str = Field(..., min_length=1, max_length=64)
    billing_period: str = Field("month", pattern=r"^(month|quarter|year)$")
    amount_yuan: int | None = Field(None, ge=0, description="实收金额（元）；填实际收到的金额，内部内购填 0")
    pay_method: str = Field("offline", pattern=r"^(alipay|wechat|transfer|offline)$")
    remark: str = Field(..., min_length=1, max_length=500, description="备注必填，用于对账（线下价格 / 原因 / 内购等）")


class AdminAddonGrant(BaseModel):
    """赠送增量包：发放增量包额度 + 建一条 amount=0 的已支付订单（记录/对账）。"""

    user_id: str = Field(..., description="目标用户 users.id")
    addon_slug: str = Field(..., min_length=1, max_length=64, description="增量包 slug")
    quantity: int = Field(1, ge=1, le=1000, description="赠送份数")
    remark: str = Field(..., min_length=1, max_length=500, description="赠送原因（必填，对账用）")


class AdminOrderMarkPaid(BaseModel):
    voucher_url: str | None = None
    actual_revenue_yuan: int | None = Field(None, ge=0)
    remark: str | None = None


class AdminOrderReject(BaseModel):
    """驳回对公转账核销。"""

    reason: str = Field(..., min_length=1, max_length=500, description="驳回原因")


class AdminOrderOut(BaseModel):
    id: str
    orderNo: str
    tenantId: str
    tenantName: str | None
    type: str
    amount: int
    payMethod: str
    # 实际支付网关：allinpay/transfer/offline；alipay/wechat + allinpay 表示走通联
    payChannel: str | None = None
    # 通联 paytype 原值，如 A01 / W06
    payTypeCode: str | None = None
    # 通联返回的交易流水号，对账用
    gatewayTrxid: str | None = None
    status: str
    description: str | None = None
    planName: str | None = None
    actualRevenue: int | None = None
    remark: str | None = None
    voucherUrl: str | None = None
    createdAt: str | None = None
    paidAt: str | None = None


class AdminInvoiceIssue(BaseModel):
    """财务开票：回填发票号 + 上传的发票文件 URL。"""

    invoice_no: str = Field(..., min_length=1, max_length=64, description="发票号")
    invoice_file_url: str | None = Field(None, max_length=1000, description="发票文件 URL")


class AdminInvoiceReject(BaseModel):
    """财务驳回开票申请。"""

    reason: str = Field(..., min_length=1, max_length=500, description="驳回原因")


class AdminInvoiceOut(BaseModel):
    id: str
    orderNo: str | None = None
    tenantName: str | None = None
    status: str
    titleType: str
    title: str
    taxNo: str | None = None
    invoiceKind: str
    regAddress: str | None = None
    regPhone: str | None = None
    bankName: str | None = None
    bankAccount: str | None = None
    email: str | None = None
    # 「元」整数，前端展示用
    amount: int
    invoiceNo: str | None = None
    invoiceFileUrl: str | None = None
    issuedAt: str | None = None
    rejectReason: str | None = None
    createdAt: str | None = None


class SalesPromote(BaseModel):
    """把已有普通用户（role=user）设为销售。"""

    user_id: str = Field(..., description="目标普通用户 users.id")
    invitation_code: str | None = Field(
        None, max_length=32, description="固定引流邀请码；留空自动生成"
    )


class SalesUpdate(BaseModel):
    nickname: str | None = Field(None, min_length=1, max_length=100)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=20)
    password: str | None = Field(None, min_length=8, max_length=128, description="重设登录密码（≥8位）；留空不改")
    status: str | None = Field(None, pattern=r"^(active|disabled)$")


class SalesOut(BaseModel):
    id: str
    nickname: str | None = None
    invitationCode: str | None = None
    email: str | None = None
    phone: str | None = None
    status: str
    referredCount: int = 0
    paidCount: int = 0
    revenueYuan: int = 0
    createdAt: str | None = None


class FinancePromote(BaseModel):
    """把已有普通用户（role=user）设为财务。"""

    user_id: str = Field(..., description="目标普通用户 users.id")


class FinanceOut(BaseModel):
    id: str
    nickname: str | None = None
    email: str | None = None
    phone: str | None = None
    status: str
    createdAt: str | None = None
