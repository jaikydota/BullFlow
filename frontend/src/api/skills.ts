import api from './index'

export type SkillItem = {
  id: string
  slug: string
  name: string
  description?: string | null
  content_types: string[]
  platforms: string[]
  category?: string | null
  icon?: string | null
  source_url?: string | null
  recommended?: boolean
}

export const skillsApi = {
  /** 列出启用的 skill（可按内容类型 / 平台过滤）。 */
  list: (params?: { content_type?: string; platform?: string }) =>
    api.get<unknown, { items: SkillItem[] }>('/skills', { params }),
  /** 取单个 skill 详情（用于生成记录溯源展示技巧名称）。 */
  get: (id: string) => api.get<unknown, SkillItem & { prompt?: string }>(`/skills/${id}`),
}
