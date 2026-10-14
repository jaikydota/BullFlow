import { adminRequest } from '@/lib/api/client'

export type BroadcastTargetKind = 'all' | 'users'

export type BroadcastFromApi = {
  id: string
  title: string
  message: string | null
  linkUrl: string | null
  type: string
  targetKind: BroadcastTargetKind
  targetUserIds: string[]
  totalCount: number
  readCount: number
  operatorId: string | null
  operatorName: string | null
  revokedAt: string | null
  createdAt: string | null
}

export type BroadcastCreateBody = {
  title: string
  message?: string | null
  link_url?: string | null
  type?: string
  target_kind: BroadcastTargetKind
  target_user_ids?: string[]
}

export async function fetchBroadcasts(params: {
  page: number
  page_size: number
}): Promise<{ items: BroadcastFromApi[]; total: number; page: number; page_size: number }> {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('page_size', String(params.page_size))
  return adminRequest(`/admin/broadcasts?${sp.toString()}`)
}

export async function createBroadcast(body: BroadcastCreateBody): Promise<BroadcastFromApi> {
  const data = await adminRequest<{ item: BroadcastFromApi }>('/admin/broadcasts', {
    method: 'POST',
    json: body,
  })
  return data.item
}

export async function revokeBroadcast(id: string): Promise<BroadcastFromApi> {
  const data = await adminRequest<{ item: BroadcastFromApi }>(
    `/admin/broadcasts/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
  return data.item
}

// 复用 admin/users 列表搜索（已有 ?search=xxx 接口）
export type UserPickerItem = {
  id: string
  email: string
  nickname: string | null
  role: string
  status: string
}

export async function searchUsersForPicker(search: string): Promise<UserPickerItem[]> {
  const sp = new URLSearchParams()
  sp.set('page', '1')
  sp.set('page_size', '20')
  if (search.trim()) sp.set('search', search.trim())
  const data = await adminRequest<{ items: UserPickerItem[] }>(`/admin/users?${sp.toString()}`)
  return data.items ?? []
}
