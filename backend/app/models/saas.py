from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDBin16, _generate_uuid7


class SaasPlan(Base):
    """平台套餐 SKU（无 user_id，全平台共享）。"""

    __tablename__ = "saas_plans"

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键"
    )
    slug: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True, comment="套餐标识，如 free / pro"
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # 多周期定价：月付价必填；季付 / 年付各有启用开关 + 可空自定义价
    # 自定义价为 NULL 且对应周期启用时，按月付价 ×3 / ×12 动态计算（默认价随月付价跟随）
    monthly_price_cents: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", comment="月付价（分，必填）"
    )
    quarterly_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="0", comment="是否出售季付"
    )
    quarterly_price_cents: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="季付自定义价（分）；NULL 且启用=月付×3"
    )
    yearly_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="0", comment="是否出售年付"
    )
    yearly_price_cents: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="年付自定义价（分）；NULL 且启用=月付×12"
    )
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", name="saas_plan_status"),
        nullable=False,
        server_default="active",
    )
    # 档位：整数，越大越高档（free=0）。列表排序与"只能升级到更高档位"判断均基于此字段
    tier: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", comment="档位，越大越高档（free=0）；排序 + 升级判断用"
    )
    points_quota: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    storage_gb: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    domestic_accounts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    overseas_accounts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    features: Mapped[list | None] = mapped_column(JSON, nullable=True, comment="权益文案列表")

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class SaasAddon(Base):
    """增值服务 SKU。"""

    __tablename__ = "saas_addons"

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键"
    )
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    addon_type: Mapped[str] = mapped_column(
        Enum(
            "points",
            "storage",
            "domestic_account",
            "overseas_account",
            name="saas_addon_type",
        ),
        nullable=False,
    )
    unit_label: Mapped[str] = mapped_column(String(255), nullable=False, comment="展示用单位说明")
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    points_quota: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
        comment="发放数量（语义随 addon_type：积分类=积分数 / 存储类=GB / 账号类=账号数）",
    )
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", name="saas_addon_status"),
        nullable=False,
        server_default="active",
    )
    # 展示排序：越小越靠前；后加的包可设中间值插入已有包之间
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", comment="展示排序，越小越靠前"
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class SaasOrder(Base):
    """B 端订单（租户维度使用 users.id 作为账号主键）。"""

    __tablename__ = "saas_orders"

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键"
    )
    order_no: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(
        UUIDBin16,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="租户主账号 users.id",
    )
    tenant_display_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True, comment="下单时租户展示名快照"
    )
    order_type: Mapped[str] = mapped_column(
        Enum("subscription", "recharge", "value_added", name="saas_order_type"),
        nullable=False,
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, comment="订单金额（分）")
    pay_method: Mapped[str] = mapped_column(
        Enum(
            "alipay",
            "wechat",
            "stripe",
            "paypal",
            "transfer",
            "offline",
            name="saas_pay_method",
        ),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        Enum("pending", "reviewing", "paid", "cancelled", "refunded", name="saas_order_status"),
        nullable=False,
        server_default="pending",
        comment="pending=待支付/待转账 reviewing=对公待核销 paid 已支付 cancelled refunded",
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan_slug: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 增值服务（加包）订单：购买的加包 slug + 份数；订阅订单这两列为 NULL
    addon_slug: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="value_added 订单购买的加包 slug"
    )
    addon_quantity: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="value_added 订单购买份数"
    )
    subscription_period: Mapped[str | None] = mapped_column(
        Enum("month", "quarter", "year", name="saas_order_subscription_period"),
        nullable=True,
        comment="订阅订单的计费周期快照（支付成功激活时用）",
    )
    actual_revenue_cents: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="实收（分）")
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    voucher_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # ---- 支付网关相关 ----
    pay_channel: Mapped[str | None] = mapped_column(
        Enum("allinpay", "transfer", "offline", name="saas_pay_channel"),
        nullable=True,
        comment="实际支付网关；alipay/wechat + allinpay 表示走通联",
    )
    pay_type_code: Mapped[str | None] = mapped_column(
        String(16), nullable=True, comment="通联 paytype 原值，如 A01 / W06"
    )
    gateway_trxid: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="通联返回的 trxid"
    )
    gateway_reqsn: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="我方上送通联的请求流水号"
    )
    qrcode_url: Mapped[str | None] = mapped_column(
        String(1000), nullable=True, comment="通联返回的 payinfo（二维码内容）"
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="订单超时时间（pending 自动取消）"
    )
    gateway_raw: Mapped[dict | list | None] = mapped_column(
        JSON, nullable=True, comment="通联完整响应（下单 + 回调），便于排查"
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class SaasInvoice(Base):
    """订单发票：用户对已支付订单申请开票，财务回填发票号 + 上传发票文件供下载。

    一订单一票（order_id 唯一）。流程：用户申请(pending) → 财务开票(issued)/驳回(rejected)；
    被驳回后用户可改信息复用同一行重新申请。
    """

    __tablename__ = "saas_invoices"

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键"
    )
    order_id: Mapped[str] = mapped_column(
        UUIDBin16,
        ForeignKey("saas_orders.id", ondelete="RESTRICT"),
        unique=True,
        index=True,
        nullable=False,
        comment="对应订单 saas_orders.id（一订单一票）",
    )
    user_id: Mapped[str] = mapped_column(
        UUIDBin16,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="申请用户 users.id",
    )
    status: Mapped[str] = mapped_column(
        Enum("pending", "issued", "rejected", "voided", name="saas_invoice_status"),
        nullable=False,
        server_default="pending",
        comment="pending=待开 issued=已开 rejected=驳回 voided=作废",
    )
    title_type: Mapped[str] = mapped_column(
        Enum("personal", "company", name="saas_invoice_title_type"),
        nullable=False,
        comment="抬头类型：个人 / 企业",
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, comment="发票抬头")
    tax_no: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="税号（企业必填）"
    )
    invoice_kind: Mapped[str] = mapped_column(
        Enum("normal", "special", name="saas_invoice_kind"),
        nullable=False,
        comment="发票类型：普票 / 专票",
    )
    # 专票专属字段（专票必填）
    reg_address: Mapped[str | None] = mapped_column(String(255), nullable=True, comment="注册地址（专票）")
    reg_phone: Mapped[str | None] = mapped_column(String(32), nullable=True, comment="注册电话（专票）")
    bank_name: Mapped[str | None] = mapped_column(String(128), nullable=True, comment="开户行（专票）")
    bank_account: Mapped[str | None] = mapped_column(String(64), nullable=True, comment="银行账号（专票）")
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, comment="收票邮箱")
    amount_cents: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="开票金额（分）= 订单实收快照"
    )
    invoice_no: Mapped[str | None] = mapped_column(String(64), nullable=True, comment="发票号（财务回填）")
    invoice_file_url: Mapped[str | None] = mapped_column(
        String(1000), nullable=True, comment="发票文件 URL（财务上传）"
    )
    issued_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="开具时间")
    issued_by: Mapped[str | None] = mapped_column(
        UUIDBin16, nullable=True, comment="开具操作员 user id（财务）"
    )
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True, comment="驳回原因")

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class SaasSubscription(Base):
    """用户当前订阅 + 周期内已用额度。一个 user 同一时刻只应有一条 active 记录（应用层加锁保证）。"""

    __tablename__ = "saas_subscriptions"

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键"
    )
    user_id: Mapped[str] = mapped_column(
        UUIDBin16,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="租户主账号 users.id",
    )
    plan_slug: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True, comment="套餐标识（快照）"
    )
    period: Mapped[str] = mapped_column(
        Enum("month", "quarter", "year", name="saas_subscription_period"),
        nullable=False,
        comment="计费周期（快照）",
    )
    status: Mapped[str] = mapped_column(
        Enum("active", "expired", "cancelled", name="saas_subscription_status"),
        nullable=False,
        server_default="active",
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    source_order_id: Mapped[str | None] = mapped_column(
        UUIDBin16,
        ForeignKey("saas_orders.id", ondelete="SET NULL"),
        nullable=True,
        comment="触发本次订阅的订单",
    )

    # 周期内额度（快照自 plan，避免 plan 改价后影响已生效订阅）
    points_quota: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    storage_gb_quota: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    domestic_accounts_quota: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    overseas_accounts_quota: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    # 已用量
    points_used: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    storage_bytes_used: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    domestic_accounts_used: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    overseas_accounts_used: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    # 加包额度（来自增量包，与套餐配额相加）：积分永久跟人走；存储/账号仅跟随当前订阅，切换/到期失效
    addon_points: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
        comment="永久有效的增量包积分余额；套餐积分用完后再扣这里",
    )
    addon_storage_gb: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", comment="加包存储（GB），与套餐存储相加；付费订阅期间有效，降级到 Free / 到期后失效"
    )
    addon_domestic_accounts: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", comment="加包国内账号数，与套餐配额相加；付费订阅期间有效，降级到 Free / 到期后失效"
    )
    addon_overseas_accounts: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", comment="加包国外账号数，与套餐配额相加；付费订阅期间有效，降级到 Free / 到期后失效"
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
