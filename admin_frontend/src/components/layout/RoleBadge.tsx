import type { LucideIcon } from 'lucide-react'
import { BadgeDollarSign, Crown, Receipt, ShieldCheck, UserCircle2 } from 'lucide-react'

import { cn } from '@/lib/utils'

type RoleMeta = { label: string; icon: LucideIcon; cls: string }

/** 后台各角色的展示元数据（标签 / 图标 / 配色），颜色按角色区分以醒目标识身份 */
const ROLE_META: Record<string, RoleMeta> = {
  super_admin: {
    label: '超级管理员',
    icon: Crown,
    cls: 'border-amber-500/45 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
  admin: {
    label: '管理员',
    icon: ShieldCheck,
    cls: 'border-primary/45 bg-primary/15 text-primary',
  },
  finance: {
    label: '财务',
    icon: Receipt,
    cls: 'border-sky-500/45 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  },
  sales: {
    label: '销售',
    icon: BadgeDollarSign,
    cls: 'border-emerald-500/45 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  user: {
    label: '普通用户',
    icon: UserCircle2,
    cls: 'border-border bg-muted text-muted-foreground',
  },
}

const FALLBACK: RoleMeta = {
  label: '—',
  icon: ShieldCheck,
  cls: 'border-border bg-muted text-muted-foreground',
}

/** 取角色中文标签（未知角色回退为原始值） */
export function roleLabel(role?: string | null): string {
  return (role && ROLE_META[role]?.label) || role || '—'
}

/** Header 右上角的醒目角色身份标识 pill */
export function RoleBadge({ role, className }: { role?: string | null; className?: string }) {
  const meta = (role && ROLE_META[role]) || { ...FALLBACK, label: role || '—' }
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-xs',
        meta.cls,
        className,
      )}
      title={`当前身份：${meta.label}`}
    >
      <Icon className="size-3.5" strokeWidth={2.4} />
      {meta.label}
    </span>
  )
}
