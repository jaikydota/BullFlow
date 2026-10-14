import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Crown } from 'lucide-react'
import { skillsApi, type SkillItem } from '@/api/skills'
import { FieldLabel } from '@/components/generation/FieldLabel'
import { SkillPickerDialog } from '@/components/generation/SkillPickerDialog'
import { cn } from '@/lib/utils'

export type SkillSelectorProps = {
  /** 选中的 skill ID（null = 不使用） */
  value: string | null | undefined
  onChange: (skillId: string | null) => void
  /** 按内容类型过滤可选 skill：article / image / video / chat */
  contentType: 'article' | 'image' | 'video' | 'chat'
  disabled?: boolean
  className?: string
  /** 紧凑模式：只显示触发按钮、不带标题行（用于工具栏） */
  compact?: boolean
}

/** 「创作大师」选择器：触发按钮 + 弹窗（搜索/分类/卡片网格），选中后把预设提示词注入生成。 */
export function SkillSelector({ value, onChange, contentType, disabled, className, compact }: SkillSelectorProps) {
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    skillsApi
      .list({ content_type: contentType })
      .then((res) => { if (!cancelled) setSkills(res.items ?? []) })
      .catch(() => { if (!cancelled) setSkills([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [contentType])

  const selected = useMemo(() => skills.find((s) => s.id === value), [skills, value])
  const triggerText = selected ? selected.name : value ? '已选创作大师' : '选择创作大师…'

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setOpen(true)}
      className={cn(
        'inline-flex h-9 cursor-pointer items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 text-sm transition-colors',
        'hover:border-primary/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        disabled && 'cursor-not-allowed opacity-60',
        compact ? 'max-w-[14rem]' : 'w-full',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Crown className={cn('size-4 shrink-0', selected || value ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
        <span className={cn('truncate text-left', !selected && !value && 'text-muted-foreground')}>{triggerText}</span>
      </span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )

  return (
    <>
      {compact ? trigger : (
        <div className={cn('space-y-2', className)}>
          <FieldLabel>创作大师</FieldLabel>
          {trigger}
        </div>
      )}
      <SkillPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        skills={skills}
        value={value}
        onSelect={onChange}
        loading={loading}
      />
    </>
  )
}
