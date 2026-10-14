import { adminRequest } from '@/lib/api/client'

export type PermissionCatalogRow = {
  id: string
  label: string
  module: string
}

export type RoleOverviewApiRow = {
  id: string
  name: string
  desc: string
  color: string
  editable: boolean
  permIds: string[]
  userCount: number
}

/** GET `/admin/roles/overview`：权限清单 + 角色定义与用户计数 */
export async function fetchRolesOverview(): Promise<{
  permissions: PermissionCatalogRow[]
  roles: RoleOverviewApiRow[]
}> {
  return adminRequest('/admin/roles/overview')
}
