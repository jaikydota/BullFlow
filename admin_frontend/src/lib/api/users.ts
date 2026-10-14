import { adminRequest } from '@/lib/api/client'
import type { AdminUserDetail, AdminUserListRow } from '@/lib/api/schema'

export type AdminUserCreatePayload = {
  // 邮箱 / 手机号二选一；只填手机号时后端自动生成占位邮箱
  email?: string | null
  password: string
  role: 'super_admin' | 'admin' | 'user'
  nickname?: string | null
  phone?: string | null
}

/** `POST /admin/users` — `admin` 只能创建 `role=user`；`super_admin` 可创建任意角色 */
export async function createAdminUser(body: AdminUserCreatePayload): Promise<AdminUserDetail> {
  const data = await adminRequest<{ user: AdminUserDetail }>('/admin/users', {
    method: 'POST',
    json: body,
  })
  return data.user
}

export async function fetchAdminUserList(params: {
  page: number
  page_size: number
  search?: string
  role?: string
}): Promise<{ items: AdminUserListRow[]; total: number; pages: number; page: number; page_size: number }> {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('page_size', String(params.page_size))
  if (params.search) sp.set('search', params.search)
  if (params.role) sp.set('role', params.role)
  return adminRequest(`/admin/users?${sp.toString()}`)
}

export async function fetchAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  const data = await adminRequest<{ user: AdminUserDetail }>(
    `/admin/users/${encodeURIComponent(userId)}`,
    { method: 'GET' },
  )
  return data.user
}

export type AdminUserPatchPayload = Partial<{
  status: 'active' | 'disabled'
  role: 'super_admin' | 'admin' | 'user'
  nickname: string
  password: string
  email: string
  phone: string
}>

export async function patchAdminUser(userId: string, body: AdminUserPatchPayload): Promise<AdminUserDetail> {
  const data = await adminRequest<{ user: AdminUserDetail }>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    json: body,
  })
  return data.user
}
