/** 对齐 backend 管理后台 API（app/admin）：`{ code, message, data }`；业务错误 `code !== 0` */

export class ApiBusinessError extends Error {
  readonly code: number | undefined

  constructor(message: string, code?: number) {
    super(message)
    this.name = 'ApiBusinessError'
    this.code = code
  }
}

export type AdminUserListRow = {
  id: string
  email: string
  phone?: string | null
  nickname?: string | null
  role: string
  status: string
  created_at?: string | null
  // 当前 active 套餐摘要（无订阅时为 null）
  plan_slug?: string | null
  plan_name?: string | null
  plan_status?: string | null
  plan_expires_at?: string | null
  points_remaining?: number | null
  points_quota?: number | null
  addon_points?: number | null
}

/** 对齐 `AdminUserDetailOut`，FastAPI JSON 默认为 snake_case 字段名 */
export type AdminUserDetail = {
  id: string
  email: string
  phone?: string | null
  nickname?: string | null
  role: string
  status: string
  language?: string
  created_by?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type DashboardSummary = {
  tenant_total: number
  new_tenants_this_month: number
  revenue_this_month_cents: number
  pending_orders: number
  stub: boolean
  notes?: Record<string, unknown>
}

export type AuditLogRow = {
  id: string
  operatorUserId?: string | null
  action: string
  resourceType?: string | null
  resourceId?: string | null
  detail?: unknown
  createdAt: string
}
