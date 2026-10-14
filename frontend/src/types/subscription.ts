export type PlanPeriod = 'month' | 'quarter' | 'year'
export type PlanStatus = 'active' | 'inactive'
export type OrderStatus = 'pending' | 'reviewing' | 'paid' | 'cancelled' | 'refunded'
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled'
export type PayMethod = 'alipay' | 'wechat' | 'transfer'
/** 服务端 SaasOrder.pay_channel 字段透传值；前端不渲染，仅作类型占位 */
export type PayChannel = string
export type QuoteAction = 'new' | 'upgrade' | 'downgrade' | 'renew'

export interface Plan {
  id: string
  slug: string
  name: string
  // 多周期定价：月付价必有；季付 / 年付为已解析的有效价，未出售则为 null
  monthly_price_cents: number
  quarterly_price_cents: number | null
  yearly_price_cents: number | null
  status: PlanStatus
  // 档位：越大越高档（free=0）。价格表按档位排序，且只能升级到不低于当前档位的套餐
  tier: number
  points_quota: number
  storage_gb: number
  domestic_accounts: number
  overseas_accounts: number
  features: string[]
}

export type AddonType = 'points' | 'storage' | 'domestic_account' | 'overseas_account'

export interface Addon {
  id: string
  slug: string
  name: string
  addon_type: AddonType
  /** 展示用单位文案（仅展示，不影响发放） */
  unit_label: string
  price_cents: number
  /** 单份发放数量（语义随类型：积分数 / GB / 账号数） */
  quota_amount: number
}

/** 取套餐在指定计费周期下的有效价（分）。季/年付为 null（未出售）时退回月付×3/×12 兜底。 */
export function planPeriodCents(plan: Plan, period: PlanPeriod): number {
  if (period === 'quarter') return plan.quarterly_price_cents ?? plan.monthly_price_cents * 3
  if (period === 'year') return plan.yearly_price_cents ?? plan.monthly_price_cents * 12
  return plan.monthly_price_cents
}

/** 套餐当前出售的计费周期（月付始终出售）。 */
export function planAvailablePeriods(plan: Plan): PlanPeriod[] {
  const out: PlanPeriod[] = ['month']
  if (plan.quarterly_price_cents != null) out.push('quarter')
  if (plan.yearly_price_cents != null) out.push('year')
  return out
}

export const PERIOD_LABEL: Record<PlanPeriod, string> = {
  month: '月付',
  quarter: '季付',
  year: '年付',
}

export const PERIOD_UNIT: Record<PlanPeriod, string> = {
  month: '月',
  quarter: '季',
  year: '年',
}

/** 季付 / 年付相对月付的"等额倍数"（用于省钱提示基线）。 */
export const PERIOD_MULTIPLIER: Record<PlanPeriod, number> = {
  month: 1,
  quarter: 3,
  year: 12,
}

export interface Quote {
  target_plan_slug: string
  target_price_cents: number
  current_plan_slug: string | null
  current_price_cents: number
  remaining_days: number
  remaining_value_cents: number
  payable_cents: number
  action: QuoteAction
  note: string | null
}

export interface OrderCreateResult {
  order_no: string
  plan_slug?: string | null
  addon_slug?: string | null
  quantity?: number | null
  amount_cents: number
  pay_method: PayMethod
  pay_type_code: string
  qrcode_url: string | null
  expires_at: string
  status: OrderStatus
  auto_activated: boolean
}

export interface Order {
  order_no: string
  plan_slug: string | null
  order_type: 'subscription' | 'recharge' | 'value_added'
  amount_cents: number
  pay_method: string
  pay_channel: PayChannel | null
  pay_type_code: string | null
  status: OrderStatus
  qrcode_url: string | null
  // 对公转账：用户上传的凭证 + 驳回原因/核销备注
  voucher_url: string | null
  remark: string | null
  description: string | null
  expires_at: string | null
  paid_at: string | null
  created_at: string
}

export interface TransferConfig {
  enabled: boolean
  company_name: string
  account_name: string
  account_number: string
  bank_name: string
  bank_branch: string
  remark_tip: string
}

// ---------------- 发票 ----------------

export type InvoiceStatus = 'pending' | 'issued' | 'rejected' | 'voided'
export type InvoiceTitleType = 'personal' | 'company'
export type InvoiceKind = 'normal' | 'special'

export interface Invoice {
  id: string
  order_no: string
  status: InvoiceStatus
  title_type: InvoiceTitleType
  title: string
  tax_no: string | null
  invoice_kind: InvoiceKind
  reg_address: string | null
  reg_phone: string | null
  bank_name: string | null
  bank_account: string | null
  email: string | null
  amount_cents: number
  invoice_no: string | null
  invoice_file_url: string | null
  issued_at: string | null
  reject_reason: string | null
  created_at: string
}

export interface InvoiceApply {
  title_type: InvoiceTitleType
  title: string
  tax_no?: string | null
  invoice_kind: InvoiceKind
  reg_address?: string | null
  reg_phone?: string | null
  bank_name?: string | null
  bank_account?: string | null
  email?: string | null
}

export interface QuotaUsage {
  quota: number
  used: number
  remaining: number
  percent: number
}

export interface Subscription {
  plan_slug: string
  plan_name: string
  period: PlanPeriod
  status: SubscriptionStatus
  // 注：period 现含 'quarter'
  started_at: string
  expires_at: string
  remaining_days: number
  features: string[]
  points: QuotaUsage
  /** 永久有效的增量包积分余额（不随订阅周期清零） */
  addon_points: number
  storage_bytes_used: number
  storage_gb_quota: number
  storage_percent: number
  domestic_accounts: QuotaUsage
  overseas_accounts: QuotaUsage
  /** 永久加包额度明细（上面各 quota 已含加包，这里单列供「含加包 X」提示） */
  addon_storage_gb: number
  addon_domestic_accounts: number
  addon_overseas_accounts: number
}
