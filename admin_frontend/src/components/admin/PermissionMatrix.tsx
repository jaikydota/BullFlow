import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'

export type PermissionRow = {
  /** 模块组（左列粗体分组） */
  group?: string
  /** 权限项 key + label */
  key: string
  label: string
  /** 该权限的描述 */
  description?: string
}

export type PermissionMatrixProps = {
  roles: { code: string; label: string }[]
  permissions: PermissionRow[]
  /** value[roleCode]: Set<permKey>（已勾选的权限） */
  value: Record<string, string[]>
  onChange: (next: Record<string, string[]>) => void
  /** 某些角色 + 权限禁用编辑（如 super_admin 永远 true） */
  isLocked?: (roleCode: string, permKey: string) => boolean
  className?: string
}

/** 角色 × 权限二维矩阵：sticky 左列权限名 + 顶行角色名 + checkbox 格子 */
export function PermissionMatrix({
  roles,
  permissions,
  value,
  onChange,
  isLocked,
  className,
}: PermissionMatrixProps) {
  // 按 group 分组渲染
  const groups: { group: string | undefined; rows: PermissionRow[] }[] = []
  for (const perm of permissions) {
    const last = groups[groups.length - 1]
    if (last && last.group === perm.group) {
      last.rows.push(perm)
    } else {
      groups.push({ group: perm.group, rows: [perm] })
    }
  }

  const toggle = (roleCode: string, permKey: string, checked: boolean) => {
    const cur = new Set(value[roleCode] ?? [])
    if (checked) cur.add(permKey)
    else cur.delete(permKey)
    onChange({ ...value, [roleCode]: Array.from(cur) })
  }

  return (
    <div
      className={cn(
        'overflow-auto rounded-xl border border-border bg-card shadow-xs',
        className,
      )}
    >
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted/50 backdrop-blur-sm">
          <tr>
            <th className="sticky left-0 z-20 min-w-[260px] border-b border-r border-border bg-muted/50 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              权限
            </th>
            {roles.map((r) => (
              <th
                key={r.code}
                className="min-w-[120px] border-b border-border px-3 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => (
            <>
              {g.group && (
                <tr key={`group-${gi}`}>
                  <td
                    colSpan={1 + roles.length}
                    className="sticky left-0 border-b border-border bg-muted/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80"
                  >
                    {g.group}
                  </td>
                </tr>
              )}
              {g.rows.map((perm, ri) => (
                <tr
                  key={`${gi}-${ri}-${perm.key}`}
                  className={ri % 2 === 1 ? 'bg-muted/10' : undefined}
                >
                  <td className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-2">
                    <div className="text-sm font-medium text-foreground">{perm.label}</div>
                    {perm.description && (
                      <div className="text-xs text-muted-foreground">{perm.description}</div>
                    )}
                  </td>
                  {roles.map((r) => {
                    const checked = (value[r.code] ?? []).includes(perm.key)
                    const locked = isLocked?.(r.code, perm.key) ?? false
                    return (
                      <td
                        key={r.code}
                        className="border-b border-border px-3 py-2 text-center"
                      >
                        <Checkbox
                          checked={checked}
                          disabled={locked}
                          onCheckedChange={(v) => toggle(r.code, perm.key, !!v)}
                          aria-label={`${r.label} - ${perm.label}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </>
          ))}
          {permissions.length === 0 && (
            <tr>
              <td
                colSpan={1 + roles.length}
                className="px-3 py-8 text-center text-sm text-muted-foreground"
              >
                暂无权限定义
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
