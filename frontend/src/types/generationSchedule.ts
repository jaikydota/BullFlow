export type ScheduleContentType = 'article' | 'image' | 'video'

/** 完整分发配置（前端 useDistributionConfig.serialize() 产出，后端原样消费） */
export interface DistributeConfig {
  platforms: string[]
  accounts: Record<string, string[]>
  extras: Record<string, Record<string, unknown>>
  /** 仅供编辑回灌的原始 UI 决策，后端忽略 */
  ui?: {
    isPublic: boolean
    original: boolean
    ai: boolean
    category: Record<string, { l1: unknown; l2: unknown }>
  }
}
export interface GenerationSchedule {
  id: string
  user_id: string
  name: string
  type: ScheduleContentType
  is_active: boolean

  cron_hour: number
  cron_minute: number
  cron_days_of_week: string | null
  timezone: string

  /** 生成配置（统一进一个 JSON，对齐三个生成页的请求体；由 GenerationConfigPanel 序列化） */
  gen_config: Record<string, unknown> | null

  /** 自动分发：生成完成后内置发到国内社媒账号 */
  auto_distribute_enabled: boolean
  /** TLF 平台代码（DouYin / XiaoHongShu / ...） */
  distribute_platform_code: string | null
  /** TlfAccount.id 数组（旧单平台字段，兼容展示） */
  distribute_account_ids: string[] | null
  /** 完整分发配置（对齐配置发布）：{platforms, accounts, extras} */
  distribute_config: DistributeConfig | null

  last_run_at: string | null
  next_run_at: string | null
  run_count: number
  last_status: 'success' | 'failed' | 'running' | null
  last_error: string | null

  created_at: string
  updated_at: string
}

export interface ScheduleRequest {
  name: string
  type: ScheduleContentType
  cron_hour: number
  cron_minute: number
  cron_days_of_week?: string | null
  timezone?: string
  /** 生成配置 JSON（含 prompt / reference / skill_id / provider / size / count / mixed 等） */
  gen_config: Record<string, unknown>

  /** 自动分发开关 */
  auto_distribute_enabled?: boolean
  /** 启用时必填，国内 TLF 平台代码 */
  distribute_platform_code?: string | null
  /** 启用时必填且非空，TlfAccount.id 数组（旧单平台字段，兼容） */
  distribute_account_ids?: string[] | null
  /** 完整分发配置（对齐配置发布） */
  distribute_config?: DistributeConfig | null
}
