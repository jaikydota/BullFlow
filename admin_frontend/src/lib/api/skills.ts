import { adminRequest } from '@/lib/api/client'

export type SkillFromApi = {
  id: string
  slug: string
  name: string
  description: string | null
  prompt: string
  contentTypes: string[]
  platforms: string[]
  category: string | null
  icon: string | null
  sourceUrl: string | null
  status: string
  recommended: boolean
  sortOrder: number
  createdAt: string | null
  updatedAt: string | null
}

export type SkillUpsertBody = {
  slug: string
  name: string
  description: string | null
  prompt: string
  content_types: string[]
  platforms: string[]
  category: string | null
  icon: string | null
  source_url: string | null
  status: string
  recommended: boolean
  sort_order: number
}

export async function fetchSkills(): Promise<SkillFromApi[]> {
  const data = await adminRequest<{ items: SkillFromApi[] }>('/admin/skills')
  return data.items ?? []
}

export async function upsertSkill(id: string | null, body: SkillUpsertBody): Promise<SkillFromApi> {
  const path = id ? `/admin/skills/${encodeURIComponent(id)}` : '/admin/skills'
  const data = await adminRequest<{ item: SkillFromApi }>(path, {
    method: id ? 'PUT' : 'POST',
    json: body,
  })
  return data.item
}

export async function deleteSkill(id: string): Promise<void> {
  await adminRequest(`/admin/skills/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
