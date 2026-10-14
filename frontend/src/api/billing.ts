import api from '@/api'
import type {
  Addon,
  Invoice,
  InvoiceApply,
  Order,
  OrderCreateResult,
  PayMethod,
  Plan,
  PlanPeriod,
  Quote,
  TransferConfig,
} from '@/types/subscription'

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export type CreditTxDirection = 'debit' | 'credit'
export type CreditTxSource = 'subscription' | 'addon' | 'mixed'
export type CreditTxBizType =
  | 'chat'
  | 'article'
  | 'image'
  | 'video'
  | 'distribution'
  | 'grant_subscription'
  | 'grant_addon'
  | 'admin_adjust'

export interface CreditTransaction {
  id: string
  direction: CreditTxDirection
  amount: number
  source: CreditTxSource
  biz_type: CreditTxBizType | string
  biz_ref_type: string | null
  biz_ref_id: string | null
  model_id: string | null
  unit_price: number | null
  units: number | null
  balance_after_sub: number
  balance_after_addon: number
  remark: string | null
  created_at: string | null
}

export const billingApi = {
  /** 公开：拉取激活套餐价格表 */
  listPlans: () => api.get<unknown, Plan[]>('/billing/plans'),

  /** 升降级预计算（需要登录）；period 指定目标计费周期 */
  quote: (slug: string, period: PlanPeriod = 'month') =>
    api.get<unknown, Quote>(`/billing/plans/${slug}/quote`, { params: { period } }),

  /** 创建订单，拿到二维码内容 */
  createOrder: (plan_slug: string, billing_period: PlanPeriod, pay_method: PayMethod) =>
    api.post<unknown, OrderCreateResult>('/billing/orders', {
      plan_slug,
      billing_period,
      pay_method,
    }),

  /** 公开：增量包（加包）列表 */
  listAddons: () => api.get<unknown, Addon[]>('/billing/addons'),

  /** 创建增量包订单，拿到二维码内容 */
  createAddonOrder: (addon_slug: string, quantity: number, pay_method: PayMethod) =>
    api.post<unknown, OrderCreateResult>('/billing/addon-orders', {
      addon_slug,
      quantity,
      pay_method,
    }),

  /** 对公转账收款账户信息（已登录用户） */
  getTransferConfig: () => api.get<unknown, TransferConfig>('/billing/transfer-config'),

  /** 用户「我已转账」提交核销（凭证可选），订单转 reviewing */
  submitTransfer: (
    order_no: string,
    body: { voucher_url?: string | null; remark?: string | null },
  ) => api.post<unknown, Order>(`/billing/orders/${order_no}/submit-transfer`, body),

  /** 查询订单状态（前端轮询用） */
  getOrder: (order_no: string) =>
    api.get<unknown, Order>(`/billing/orders/${order_no}`),

  /** 用户主动取消 pending 订单 */
  cancelOrder: (order_no: string) =>
    api.post<unknown, Order>(`/billing/orders/${order_no}/cancel`),

  /** 我的订单分页 */
  listOrders: (page = 1, page_size = 20) =>
    api.get<unknown, PaginatedResponse<Order>>('/billing/orders', {
      params: { page, page_size },
    }),

  /** 对已支付订单申请开票（被驳回后可改信息重新申请） */
  applyInvoice: (order_no: string, payload: InvoiceApply) =>
    api.post<unknown, Invoice>(`/billing/orders/${order_no}/invoice`, payload),

  /** 我的发票列表 */
  listInvoices: () => api.get<unknown, Invoice[]>('/billing/invoices'),

  /** 我的积分流水 / 用量明细 */
  listCreditTransactions: (params: {
    page?: number
    page_size?: number
    biz_type?: CreditTxBizType | ''
    direction?: CreditTxDirection | ''
  } = {}) =>
    api.get<unknown, PaginatedResponse<CreditTransaction>>(
      '/billing/credit-transactions',
      {
        params: {
          page: params.page ?? 1,
          page_size: params.page_size ?? 20,
          ...(params.biz_type ? { biz_type: params.biz_type } : {}),
          ...(params.direction ? { direction: params.direction } : {}),
        },
      },
    ),
}
