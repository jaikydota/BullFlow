/** 后台表单 / 列表用类型 — 以 backend 管理后台 API（app/admin，OpenAPI）为准 */

export type PlanStatus = 'active' | 'inactive'

export type Plan = {
  id: string
  name: string
  // 多周期定价：月付价必填；季付 / 年付各有启用开关 + 可空自定义价（null=走默认 ×3/×12）
  monthlyPrice: number
  quarterlyEnabled: boolean
  quarterlyPrice: number | null
  yearlyEnabled: boolean
  yearlyPrice: number | null
  status: PlanStatus
  // 档位：越大越高档（free=0）；列表排序与"只能升级到更高档位"判断均基于此字段
  tier: number
  pointsQuota: number
  storageGB: number
  domesticAccounts: number
  overseasAccounts: number
  features: string[]
}

export type VasType = 'points' | 'storage' | 'domestic_account' | 'overseas_account'

export type ValueAddedService = {
  id: string
  name: string
  type: VasType
  unit: string
  price: number
  /** 积分类增量包发放的积分数；其他类型固定为 0 */
  pointsQuota: number
  /** 展示排序，越小越靠前 */
  sortOrder: number
  status: PlanStatus
}

export type OrderType = 'subscription' | 'recharge' | 'value_added'

export type OrderStatus = 'pending' | 'reviewing' | 'paid' | 'cancelled' | 'refunded'

export type PayMethod = 'alipay' | 'wechat' | 'stripe' | 'paypal' | 'transfer' | 'offline'

export type Order = {
  id: string
  orderNo: string
  tenantId: string
  tenantName: string
  type: OrderType
  amount: number
  payMethod: PayMethod
  status: OrderStatus
  description: string
  planName?: string
  createdAt: string
  paidAt?: string
  actualRevenue?: number
  remark?: string
  voucherUrl?: string
}

// ---------------- 发票 ----------------

export type InvoiceStatus = 'pending' | 'issued' | 'rejected' | 'voided'
export type InvoiceTitleType = 'personal' | 'company'
export type InvoiceKind = 'normal' | 'special'

export type Invoice = {
  id: string
  orderNo?: string
  tenantName?: string
  status: InvoiceStatus | string
  titleType: InvoiceTitleType | string
  title: string
  taxNo?: string | null
  invoiceKind: InvoiceKind | string
  regAddress?: string | null
  regPhone?: string | null
  bankName?: string | null
  bankAccount?: string | null
  email?: string | null
  /** 开票金额（元） */
  amount: number
  invoiceNo?: string | null
  invoiceFileUrl?: string | null
  issuedAt?: string | null
  rejectReason?: string | null
  createdAt?: string | null
}

export type MonthlyRevenue = {
  month: string
  revenue: number
  orderCount: number
  pointsRecharge: number
  subscriptionRevenue: number
  valueAddedRevenue: number
}
