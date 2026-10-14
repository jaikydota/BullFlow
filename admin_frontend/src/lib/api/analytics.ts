import { adminRequest } from '@/lib/api/client'

export type AnalyticsOverview = {
  user_registrations: { series: Array<{ month: string; new_users: number }> }
  order_status: { by_status: Record<string, number> }
  content_stats: {
    new_users_this_month: number
    completed_generations_this_month: number
    documents_completed_this_month: number
    generation_total_all_time: number
  }
  model_usage_generations: { items: Array<{ modelName: string; count: number }> }
  generation_daily: { series: Array<{ date: string; generations: number }> }
}

/** 聚合：`GET /admin/analytics/overview` */
export async function fetchAnalyticsOverview(params?: {
  months?: number
  days?: number
  model_limit?: number
}): Promise<AnalyticsOverview> {
  const sp = new URLSearchParams()
  if (params?.months != null) sp.set('months', String(params.months))
  if (params?.days != null) sp.set('days', String(params.days))
  if (params?.model_limit != null) sp.set('model_limit', String(params.model_limit))
  const q = sp.toString()
  return adminRequest<AnalyticsOverview>(`/admin/analytics/overview${q ? `?${q}` : ''}`)
}
