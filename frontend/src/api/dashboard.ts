import api from './index'

export type DashboardStats = {
  documents: number
  images: number
  videos: number
  chats: number
  generations: number
}

export type RecentDocument = {
  id: string
  title: string
  fileSize: number | null
  status: string
  createdAt: string | null
}

export type DashboardSummary = DashboardStats & {
  recentDocuments: RecentDocument[]
}

export type DashboardTotals = {
  documents: number
  images: number
  videos: number
  audios: number
  uploads: number
  generations: number
  chats: number
  messages: number
  publishTasks: number
  socialAccounts: number
  storageBytes: number
}

export type UploadTrendPoint = {
  date: string
  documents: number
  images: number
  videos: number
  audios: number
}

export type ActivityTrendPoint = {
  date: string
  generations: number
  messages: number
  publishes: number
}

export type KeyCount = { key: string; count: number }

export type PublishPlatformStat = {
  platform: string
  tasks: number
  success: number
  failed: number
}

export type AccountPlatformStat = { platform: string; count: number }

export type DashboardAnalytics = {
  days: number
  totals: DashboardTotals
  uploadTrend: UploadTrendPoint[]
  activityTrend: ActivityTrendPoint[]
  generationByType: KeyCount[]
  generationByStatus: KeyCount[]
  publishByPlatform: PublishPlatformStat[]
  accountsByPlatform: AccountPlatformStat[]
}

export const dashboardApi = {
  /** 5 类资产 count + 最近 N 篇文档（一次请求） */
  summary: (recentLimit = 5) =>
    api.get<unknown, DashboardSummary>(`/dashboard/stats?recent_limit=${recentLimit}`),

  /** 数据仪表板多维度统计（趋势 + 分布），days ∈ [7, 90] */
  analytics: (days = 30) =>
    api.get<unknown, DashboardAnalytics>(`/dashboard/analytics?days=${days}`),
}
