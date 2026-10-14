import { FileText, Image as ImageIcon, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FastType } from '@/pages/chat/fastConfig'

export type FastTypeSelectorProps = {
  value: FastType
  onChange: (v: FastType) => void
  className?: string
}

const ITEMS: Array<{ value: FastType; label: string; icon: typeof FileText }> = [
  { value: 'article', label: '文章', icon: FileText },
  { value: 'image', label: '图片', icon: ImageIcon },
  { value: 'video', label: '视频', icon: Video },
]

export function FastTypeSelector({ value, onChange, className }: FastTypeSelectorProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5',
        className,
      )}
      role="radiogroup"
      aria-label="生成类型"
    >
      {ITEMS.map((it) => {
        const Icon = it.icon
        const active = value === it.value
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(it.value)}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-card text-primary shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" strokeWidth={2.25} aria-hidden />
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
