import { adminFormPost, adminRequest } from '@/lib/api/client'
import type { AuditLogRow } from '@/lib/api/schema'
import type { MonthlyRevenue, Order } from '@/lib/types'

export type { AuditLogRow } from '@/lib/api/schema'

function normalizeOrder(row: Partial<Order>): Order {
  return {
    id: String(row.id ?? ''),
    orderNo: String(row.orderNo ?? ''),
    tenantId: String(row.tenantId ?? ''),
    tenantName: row.tenantName ?? '—',
    type: row.type as Order['type'],
    amount: typeof row.amount === 'number' ? row.amount : 0,
    payMethod: row.payMethod as Order['payMethod'],
    status: row.status as Order['status'],
    description: row.description ?? '',
    planName: row.planName ?? undefined,
    createdAt: row.createdAt ?? '',
    paidAt: row.paidAt ?? undefined,
    actualRevenue: row.actualRevenue ?? undefined,
    remark: row.remark ?? undefined,
    voucherUrl: row.voucherUrl ?? undefined,
  }
}

export async function fetchOrderList(params: {
  page: number
  page_size: number
  search?: string
  order_type?: string
  status?: string
}): Promise<{ items: Order[]; total: number; pages: number }> {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('page_size', String(params.page_size))
  if (params.search) sp.set('search', params.search)
  if (params.order_type) sp.set('order_type', params.order_type)
  if (params.status) sp.set('status', params.status)
  const raw = await adminRequest<{
    items: Partial<Order>[]
    total: number
    pages: number
  }>(`/admin/orders?${sp.toString()}`)
  return {
    ...raw,
    items: (raw.items ?? []).map(normalizeOrder),
  }
}

export async function markOrderPaidApi(
  orderId: string,
  body: { voucher_url: string | null; actual_revenue_yuan: number | null; remark: string | null },
): Promise<Order> {
  const data = await adminRequest<{ order: Order }>(
    `/admin/orders/${encodeURIComponent(orderId)}/mark-paid`,
    {
      method: 'POST',
      json: {
        voucher_url: body.voucher_url,
        actual_revenue_yuan:
          body.actual_revenue_yuan == null ? null : Math.round(Number(body.actual_revenue_yuan)),
        remark: body.remark,
      },
    },
  )
  return normalizeOrder(data.order)
}

export type GrantSubscriptionBody = {
  user_id: string
  plan_slug: string
  billing_period: 'month' | 'quarter' | 'year'
  amount_yuan?: number | null
  pay_method?: string
  remark: string // 必填：对账备注
}

/** 内部开通套餐：为某用户注入套餐（建已支付订单 + 激活订阅）。返回生成的订单。 */
export async function grantSubscriptionApi(body: GrantSubscriptionBody): Promise<Order> {
  const data = await adminRequest<{ order: Order }>('/admin/orders/grant', {
    method: 'POST',
    json: body,
  })
  return normalizeOrder(data.order)
}

export type GrantAddonBody = {
  user_id: string
  addon_slug: string
  quantity: number
  remark: string // 必填：赠送原因（对账用）
}

/** 赠送增量包：为某用户发放增量包额度（建一条 amount=0 的已支付订单做记录）。返回订单。 */
export async function grantAddonApi(body: GrantAddonBody): Promise<Order> {
  const data = await adminRequest<{ order: Order }>('/admin/orders/grant-addon', {
    method: 'POST',
    json: body,
  })
  return normalizeOrder(data.order)
}

export async function refundOrderApi(orderId: string, reason: string): Promise<Order> {
  const sp = new URLSearchParams()
  if (reason) sp.set('remark', reason)
  const data = await adminRequest<{ order: Order }>(
    `/admin/orders/${encodeURIComponent(orderId)}/refund?${sp.toString()}`,
    { method: 'POST' },
  )
  return normalizeOrder(data.order)
}

/** 驳回对公转账核销：reviewing → pending（退回待提交）并通知用户。 */
export async function rejectTransferApi(orderId: string, reason: string): Promise<Order> {
  const data = await adminRequest<{ order: Order }>(
    `/admin/orders/${encodeURIComponent(orderId)}/reject-transfer`,
    { method: 'POST', json: { reason } },
  )
  return normalizeOrder(data.order)
}

/** 上传管理端文件（图片或 PDF，如收款凭证）到 MinIO，返回公开 URL。 */
export async function uploadAdminFileApi(file: File): Promise<{ url: string; filename: string }> {
  const fd = new FormData()
  fd.append('file', file)
  return adminFormPost<{ url: string; filename: string }>('/admin/uploads/file', fd)
}

export async function fetchAuditLogs(params: {
  page: number
  page_size: number
  search?: string
}): Promise<{ items: AuditLogRow[]; total: number; pages: number }> {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('page_size', String(params.page_size))
  if (params.search) sp.set('search', params.search)
  return adminRequest(`/admin/audit-logs?${sp.toString()}`)
}

export async function fetchFinanceMonthly(): Promise<MonthlyRevenue[]> {
  const data = await adminRequest<{ monthly_revenue: MonthlyRevenue[] }>('/admin/finance/monthly')
  return data.monthly_revenue ?? []
}

export type FinanceSummary = {
  total_revenue_yuan: number
  paid_orders: number
  pending_orders: number
  refunded_orders_amount_yuan: number
}

export async function fetchFinanceSummary(): Promise<FinanceSummary> {
  return adminRequest<FinanceSummary>('/admin/finance/summary')
}

export async function fetchPlatformSettings(): Promise<Record<string, unknown>> {
  return adminRequest<Record<string, unknown>>('/admin/platform-settings')
}

export async function updatePlatformSettings(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return adminRequest<Record<string, unknown>>('/admin/platform-settings', {
    method: 'PUT',
    json: patch,
  })
}

/** 通知渠道（`platform_settings.notification_channels` 的结构化读写，与 `/admin/platform-settings` 同一存储） */
export async function fetchNotificationChannels(): Promise<Record<string, unknown>> {
  const data = await adminRequest<{ channels: Record<string, unknown> }>('/admin/notification-channels')
  return data.channels ?? {}
}

export async function updateNotificationChannels(
  channels: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const data = await adminRequest<{ channels: Record<string, unknown> }>('/admin/notification-channels', {
    method: 'PUT',
    json: channels,
  })
  return data.channels ?? {}
}

export type NotificationChannelTestResult = {
  ok: boolean
  detail: string
  to?: string
  touser?: string
  httpStatus?: number
}

export async function testNotificationChannelApi(body: {
  channel: 'smtp' | 'feishu' | 'wecom'
  to_email?: string | null
  touser?: string | null
}): Promise<NotificationChannelTestResult> {
  return adminRequest<NotificationChannelTestResult>('/admin/notification-channels/test', {
    method: 'POST',
    json: body,
  })
}

export type AdminPlanFromApi = {
  id: string
  slug: string
  name: string
  monthlyPrice: number
  quarterlyEnabled: boolean
  quarterlyPrice: number | null
  yearlyEnabled: boolean
  yearlyPrice: number | null
  status: string
  tier?: number
  pointsQuota: number
  storageGB: number
  domesticAccounts: number
  overseasAccounts: number
  features?: string[]
}

export type AdminAddonFromApi = {
  id: string
  slug: string
  name: string
  type: string
  unit: string
  price: number
  pointsQuota?: number
  sortOrder?: number
  status: string
}

export async function fetchPlans(): Promise<AdminPlanFromApi[]> {
  const data = await adminRequest<{ plans: AdminPlanFromApi[] }>('/admin/plans')
  return data.plans ?? []
}

export async function fetchAddons(
  params?: { addon_type?: 'points' | 'storage' | 'domestic_account' | 'overseas_account' },
): Promise<AdminAddonFromApi[]> {
  const qs = params?.addon_type ? `?addon_type=${params.addon_type}` : ''
  const data = await adminRequest<{ services: AdminAddonFromApi[] }>(`/admin/addons${qs}`)
  return data.services ?? []
}

export type AdminPlanUpsertBody = {
  slug: string
  name: string
  monthly_price_yuan: number
  quarterly_enabled: boolean
  quarterly_price_yuan: number | null
  yearly_enabled: boolean
  yearly_price_yuan: number | null
  status: string
  tier: number
  points_quota: number
  storage_gb: number
  domestic_accounts: number
  overseas_accounts: number
  features: string[]
}

/** 新建 POST；已有 PUT `admin/plans/{slug}` */
export async function upsertPlanApi(
  existingSlug: string | null | undefined,
  body: AdminPlanUpsertBody,
): Promise<AdminPlanFromApi> {
  const slug = existingSlug?.trim()
  const path =
    slug && slug.length > 0 ? `/admin/plans/${encodeURIComponent(slug)}` : '/admin/plans'
  const method = slug && slug.length > 0 ? 'PUT' : 'POST'
  const data = await adminRequest<{ plan: AdminPlanFromApi }>(path, {
    method,
    json: body,
  })
  return data.plan
}

/** 把套餐当前额度同步到该套餐所有 active 订阅。mode：upgrade_only 只升不降 / align 强制对齐。 */
export async function syncPlanQuotaApi(
  slug: string,
  mode: 'upgrade_only' | 'align',
): Promise<{ slug: string; mode: string; synced: number }> {
  return adminRequest<{ slug: string; mode: string; synced: number }>(
    `/admin/plans/${encodeURIComponent(slug)}/sync-quota?mode=${mode}`,
    { method: 'POST' },
  )
}

/** 删除套餐；使用该套餐的用户会被转换到 targetSlug 套餐。返回转换用户数。 */
export async function deletePlanApi(
  slug: string,
  targetSlug: string,
): Promise<{ slug: string; target_slug: string; migrated: number }> {
  const qs = `?target_slug=${encodeURIComponent(targetSlug)}`
  return adminRequest<{ slug: string; target_slug: string; migrated: number }>(
    `/admin/plans/${encodeURIComponent(slug)}${qs}`,
    { method: 'DELETE' },
  )
}

export type AdminAddonUpsertBody = {
  slug: string
  name: string
  type: string
  unit: string
  price_yuan: number
  points_quota?: number
  status: string
}

/** 新建 POST；已有 PUT `admin/addons/{slug}` */
export async function upsertAddonApi(
  existingSlug: string | null | undefined,
  body: AdminAddonUpsertBody,
): Promise<AdminAddonFromApi> {
  const slug = existingSlug?.trim()
  const path =
    slug && slug.length > 0 ? `/admin/addons/${encodeURIComponent(slug)}` : '/admin/addons'
  const method = slug && slug.length > 0 ? 'PUT' : 'POST'
  const data = await adminRequest<{ service: AdminAddonFromApi }>(path, {
    method,
    json: body,
  })
  return data.service
}

/** 删除增值服务 / 加包。 */
export async function deleteAddonApi(slug: string): Promise<{ slug: string }> {
  return adminRequest<{ slug: string }>(`/admin/addons/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  })
}

