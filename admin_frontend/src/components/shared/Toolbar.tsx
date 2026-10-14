import * as React from 'react'
import { cn } from '@/lib/utils'

export type ToolbarProps = {
  search?: React.ReactNode
  filters?: React.ReactNode
  actions?: React.ReactNode
  /** sticky 浅磨砂工具栏（带 backdrop） */
  sticky?: boolean
  className?: string
  children?: React.ReactNode
}

export function Toolbar({
  search,
  filters,
  actions,
  sticky = false,
  className,
  children,
}: ToolbarProps) {
  return (
    <div
      className={cn(
        'mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/80 p-3 shadow-xs',
        sticky && 'sticky top-0 z-20 glass-soft',
        className,
      )}
    >
      {search && <div className="min-w-[220px] flex-1 sm:max-w-md">{search}</div>}
      {filters && (
        <div className="flex flex-wrap items-center gap-2">{filters}</div>
      )}
      {children}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
