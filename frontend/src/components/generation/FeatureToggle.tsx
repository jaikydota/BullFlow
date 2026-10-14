import type { LucideIcon } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

/** 按内容类型语义色给开关上色（article=blue / image=emerald）。 */
const ACCENT = {
  article: { on: 'border-blue-500/45 bg-blue-500/[0.06]', hover: 'hover:border-blue-500/35', box: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  image: { on: 'border-emerald-500/45 bg-emerald-500/[0.06]', hover: 'hover:border-emerald-500/35', box: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
} as const

export type FeatureToggleProps = {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  icon: LucideIcon
  label: string
  hint?: string
  accent: keyof typeof ACCENT
  className?: string
}

/** 醒目的「特性开关」卡片：图标盒 + 标题 + 说明 + 勾选框，选中时按内容色高亮。 */
export function FeatureToggle({ checked, onChange, disabled, icon: Icon, label, hint, accent, className }: FeatureToggleProps) {
  const a = ACCENT[accent]
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-app',
        checked ? a.on : cn('border-border bg-card hover:bg-muted/40', a.hover),
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors', checked ? a.box : 'bg-muted text-muted-foreground')}>
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} disabled={disabled} />
    </label>
  )
}
