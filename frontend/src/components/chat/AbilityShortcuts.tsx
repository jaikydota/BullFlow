import { cn } from '@/lib/utils'
import type { Ability } from '@/pages/chat/abilities'

export type AbilityShortcutsProps = {
  abilities: Ability[]
  selected?: string | null
  onSelect: (a: Ability) => void
  align?: 'center' | 'left'
  className?: string
}

export function AbilityShortcuts({
  abilities,
  selected,
  onSelect,
  align = 'center',
  className,
}: AbilityShortcutsProps) {
  if (abilities.length === 0) return null

  return (
    <div
      className={cn(
        'flex flex-wrap gap-2',
        align === 'center' ? 'justify-center' : 'justify-start',
        className,
      )}
    >
      {abilities.map((a) => {
        const Icon = a.icon
        const active = selected === a.id
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a)}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
              active
                ? 'border-primary/40 bg-primary/10 text-primary shadow-xs'
                : 'border-border bg-card text-foreground/80 hover:border-primary/30 hover:bg-primary/5 hover:text-primary',
            )}
          >
            <Icon className="size-3.5" strokeWidth={2.25} aria-hidden />
            {a.label}
          </button>
        )
      })}
    </div>
  )
}
