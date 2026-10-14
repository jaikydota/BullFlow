import { adminRequest } from '@/lib/api/client'
import type { DashboardSummary } from '@/lib/api/schema'

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return adminRequest<DashboardSummary>('/admin/dashboard/summary')
}
