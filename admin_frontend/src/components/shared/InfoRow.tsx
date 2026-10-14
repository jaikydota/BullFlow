import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type InfoRowProps = {
  label: React.ReactNode
  value: React.ReactNode
  icon?: LucideIcon
  /** 标签与值是否上下堆叠（默认左右排列） */
  stacked?: boolean
  className?: string
}

export function InfoRow({ label, value, icon: Icon, stacked = false, className }: InfoRowProps) {
  return (
    <div
      className={cn(
        'group rounded-lg px-3 py-2 transition-colors hover:bg-muted/50',
        stacked ? 'space-y-1' : 'flex items-center justify-between gap-4',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className="size-3.5" strokeWidth={2.1} />}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          'text-sm text-foreground',
          stacked ? '' : 'truncate text-right',
        )}
      >
        {value}
      </div>
    </div>
  )
}
