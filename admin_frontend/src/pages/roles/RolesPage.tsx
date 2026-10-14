import * as React from 'react'
import { Check, Loader2, Lock, ShieldCheck, Users as UsersIcon } from 'lucide-react'
import toast from 'react-hot-toast'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  EmptyState,
  PageContainer,
  PageHeader,
  SectionCard,
} from '@/components/shared'
import { cn } from '@/lib/utils'
import {
  fetchRolesOverview,
  type PermissionCatalogRow,
  type RoleOverviewApiRow,
} from '@/lib/api/roles'
import { ApiBusinessError } from '@/lib/api/schema'

export default function RolesPage() {
  const [permissions, setPermissions] = React.useState<PermissionCatalogRow[]>([])
  const [roles, setRoles] = React.useState<RoleOverviewApiRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [activeRoleId, setActiveRoleId] = React.useState<string | null>(null)
  const [rolePerms, setRolePerms] = React.useState<Record<string, string[]>>({})

  React.useEffect(() => {
    setLoading(true)
    fetchRolesOverview()
      .then((data) => {
        setPermissions(data.permissions ?? [])
        setRoles(data.roles ?? [])
        setRolePerms(
          Object.fromEntries((data.roles ?? []).map((r) => [r.id, [...r.permIds]])),
        )
        const first = (data.roles ?? []).find((r) => r.editable) ?? (data.roles ?? [])[0]
        setActiveRoleId(first?.id ?? null)
      })
      .catch((e) => {
        if (e instanceof ApiBusinessError) toast.error(e.message)
        else toast.error('角色矩阵加载失败')
      })
      .finally(() => setLoading(false))
  }, [])

  const activeRole = React.useMemo(
    () => roles.find((r) => r.id === activeRoleId) ?? roles[0] ?? null,
    [roles, activeRoleId],
  )

  const togglePerm = (roleId: string, permId: string) => {
    setRolePerms((prev) => {
      const cur = prev[roleId] || []
      return {
        ...prev,
        [roleId]: cur.includes(permId) ? cur.filter((p) => p !== permId) : [...cur, permId],
      }
    })
  }

  const modules = Array.from(new Set(permissions.map((p) => p.module)))

  const handleSave = () => {
    if (!activeRole) return
    toast.success(
      `「${activeRole.name}」的勾选已记录在本地演示状态（服务端未提供角色写入接口）`,
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="角色权限"
        description="GET /admin/roles/overview — 用户数来自数据库；权限矩阵文案由后端定义"
        icon={ShieldCheck}
        iconAccent="info"
        breadcrumbs={[{ label: '用户与权限' }, { label: '角色权限' }]}
      />

      {loading && (
        <SectionCard>
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" strokeWidth={2.25} />
            加载中…
          </div>
        </SectionCard>
      )}

      {!loading && roles.length === 0 && (
        <SectionCard>
          <EmptyState icon={ShieldCheck} title="暂无角色数据" />
        </SectionCard>
      )}

      {!loading && activeRole && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* 左侧角色列表 */}
          <div className="space-y-2.5">
            {roles.map((role) => {
              const active = activeRole.id === role.id
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setActiveRoleId(role.id)}
                  className={cn(
                    'card-hover w-full cursor-pointer rounded-xl border bg-card p-4 text-left transition-all',
                    active ? 'border-primary bg-primary/[0.04]' : 'border-border',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck
                        className={cn('size-4', active ? 'text-primary' : 'text-muted-foreground')}
                        strokeWidth={2.25}
                      />
                      <span className="text-sm font-medium text-foreground">{role.name}</span>
                    </div>
                    <Badge variant="outline" className="gap-0.5 text-[10px]">
                      <UsersIcon className="size-3" strokeWidth={2.25} />
                      {role.userCount}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{role.desc}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {rolePerms[role.id]?.length || 0} 项勾选
                  </p>
                </button>
              )
            })}
          </div>

          {/* 右侧权限矩阵 */}
          <SectionCard
            className="lg:col-span-2"
            title={`${activeRole.name} 权限配置`}
            description={activeRole.desc}
            icon={ShieldCheck}
            actions={
              activeRole.editable && (
                <Button size="sm" onClick={handleSave}>
                  <Check className="size-4" strokeWidth={2.25} />
                  保存更改
                </Button>
              )
            }
          >
            {!activeRole.editable && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                <Lock className="size-4" strokeWidth={2.25} />
                系统默认角色，界面禁止修改勾选
              </div>
            )}

            <div className="space-y-5">
              {modules.map((mod) => (
                <div key={mod}>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    {mod}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {permissions
                      .filter((p) => p.module === mod)
                      .map((perm) => {
                        const checked = (rolePerms[activeRole.id] || []).includes(perm.id)
                        return (
                          <div
                            key={perm.id}
                            className={cn(
                              'flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5',
                              !activeRole.editable && 'opacity-60',
                            )}
                          >
                            <span className="text-sm text-foreground">{perm.label}</span>
                            <Switch
                              checked={checked}
                              disabled={!activeRole.editable}
                              onCheckedChange={() => togglePerm(activeRole.id, perm.id)}
                            />
                          </div>
                        )
                      })}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}
    </PageContainer>
  )
}
