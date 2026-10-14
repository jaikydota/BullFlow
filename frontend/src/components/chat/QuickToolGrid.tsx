import { useNavigate } from 'react-router-dom'
import { IconBox } from '@/components/shared'
import { cn } from '@/lib/utils'
import type { QuickTool } from '@/pages/chat/quickTools'

export type QuickToolGridProps = {
  tools: QuickTool[]
  /** prompt 类工具点击 → 回调到 ChatComposer 预填 */
  onPromptFill?: (prompt: string) => void
  className?: string
}

export function QuickToolGrid({ tools, onPromptFill, className }: QuickToolGridProps) {
  const navigate = useNavigate()

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5',
        className,
      )}
    >
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => {
            if (t.to) navigate(t.to)
            else if (t.prompt && onPromptFill) onPromptFill(t.prompt)
          }}
          className={cn(
            'group flex cursor-pointer flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-all',
            'hover:border-primary/30 hover:shadow-card hover:-translate-y-0.5',
          )}
        >
          <IconBox icon={t.icon} accent={t.accent} size="md" />
          <div className="min-w-0 space-y-0.5">
            <div className="text-sm font-semibold text-foreground group-hover:text-primary">{t.title}</div>
            <div className="line-clamp-1 text-xs text-muted-foreground">{t.desc}</div>
          </div>
        </button>
      ))}
    </div>
  )
}
