import { adminRequest } from '@/lib/api/client'

export type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'custom'

export type RangeParams = { range: RangeKey; start?: string; end?: string }

export type TrackingMetrics = {
  visit_users: number
  visit_pv: number
  register_users: number
  login_users: number
  create_project_count: number
  generation_count: number
  generation_success_count: number
  generation_failed_count: number
  export_count: number
  export_success_count: number
  export_failed_count: number
  pricing_visit_users: number
  plan_select_users: number
  pay_start_users: number
  pay_success_users: number
  pay_failed_count: number
  revenue_cents: number
  // 计算率
  generation_success_rate: number
  generation_failed_rate: number
  export_success_rate: number
  export_failed_rate: number
  pay_success_rate: number
  register_conversion_rate: number
  pay_conversion_rate: number
}

export type TrendPoint = Record<string, number | string> & { date: string }

export type TrackingSummary = {
  range: { key: string; start: string; end: string }
  metrics: TrackingMetrics
  trend: TrendPoint[]
}

export type FunnelStep = {
  event: string
  label: string
  count: number
  rate_from_first: number
  rate_from_prev: number
  loss: number
}

export type TrackingFunnel = {
  range: { key: string; start: string; end: string }
  steps: FunnelStep[]
}

export type TrackingEvent = {
  id: string
  event_name: string
  user_id: string | null
  visitor_id: string
  page_url: string | null
  properties: Record<string, unknown> | null
  created_at: string
}

export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

/** 事件名选项（与后端 core/analytics_events.py 契约一致，用于明细筛选） */
export const EVENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'page_view', label: '页面访问' },
  { value: 'register_success', label: '注册成功' },
  { value: 'login_success', label: '登录成功' },
  { value: 'enter_create_page', label: '进入创作页' },
  { value: 'create_project', label: '创建项目' },
  { value: 'generation_start', label: '生成开始' },
  { value: 'generation_success', label: '生成成功' },
  { value: 'generation_failed', label: '生成失败' },
  { value: 'export_start', label: '导出开始' },
  { value: 'export_success', label: '导出成功' },
  { value: 'export_failed', label: '导出失败' },
  { value: 'view_pricing', label: '访问套餐页' },
  { value: 'select_plan', label: '选择套餐' },
  { value: 'payment_start', label: '发起支付' },
  { value: 'payment_success', label: '支付成功' },
  { value: 'payment_failed', label: '支付失败' },
  { value: 'quota_exhausted', label: '额度耗尽' },
  { value: 'upgrade_modal_shown', label: '升级弹窗展示' },
  { value: 'upgrade_click', label: '点击升级' },
]

function rangeQuery(p: RangeParams, extra?: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams()
  sp.set('range', p.range)
  if (p.range === 'custom') {
    if (p.start) sp.set('start', p.start)
    if (p.end) sp.set('end', p.end)
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v != null && v !== '') sp.set(k, String(v))
    }
  }
  const q = sp.toString()
  return q ? `?${q}` : ''
}

export function fetchTrackingOverview(p: RangeParams): Promise<TrackingSummary> {
  return adminRequest<TrackingSummary>(`/admin/tracking/overview${rangeQuery(p)}`)
}

export function fetchTrackingCreation(p: RangeParams): Promise<TrackingSummary> {
  return adminRequest<TrackingSummary>(`/admin/tracking/creation${rangeQuery(p)}`)
}

export function fetchTrackingPayment(p: RangeParams): Promise<TrackingSummary> {
  return adminRequest<TrackingSummary>(`/admin/tracking/payment${rangeQuery(p)}`)
}

export function fetchTrackingFunnel(p: RangeParams): Promise<TrackingFunnel> {
  return adminRequest<TrackingFunnel>(`/admin/tracking/funnel${rangeQuery(p)}`)
}

export function fetchTrackingEvents(
  p: RangeParams & { event_name?: string; user_id?: string; page?: number; page_size?: number },
): Promise<Paginated<TrackingEvent>> {
  return adminRequest<Paginated<TrackingEvent>>(
    `/admin/tracking/events${rangeQuery(p, {
      event_name: p.event_name,
      user_id: p.user_id,
      page: p.page,
      page_size: p.page_size,
    })}`,
  )
}
