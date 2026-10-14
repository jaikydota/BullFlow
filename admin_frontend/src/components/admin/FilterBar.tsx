import * as React from 'react'

import { cn } from '@/lib/utils'

export type FilterBarProps = {
  /** 左侧搜索区，建议放 `<SearchInput>` */
  search?: React.ReactNode
  /** 中部过滤器区，可放多个 `<Select>` / `<ButtonGroup>` */
  filters?: React.ReactNode
  /** 右侧操作按钮区，如「新建」「批量导入」「刷新」 */
  actions?: React.ReactNode
  /** 是否吸顶（外层需有相对父级） */
  sticky?: boolean
  className?: string
}

/** 列表页工具栏：搜索 / 过滤 / 操作三段式 */
export function FilterBar({ search, filters, actions, sticky, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 shadow-xs',
        sticky && 'glass-soft sticky top-0 z-20',
        className,
      )}
    >
      {search && <div className="flex shrink-0 items-center">{search}</div>}
      {filters && (
        <div className="flex flex-1 flex-wrap items-center gap-2">{filters}</div>
      )}
      {actions && (
        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
}
