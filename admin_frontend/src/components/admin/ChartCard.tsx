import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'

import { cn } from '@/lib/utils'
import { IconBox, type IconBoxAccent } from '@/components/shared/IconBox'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared'

export type ChartCardProps = {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: LucideIcon
  iconAccent?: IconBoxAccent
  /** 右上角操作（时间范围 / 切换图表类型 等） */
  toolbar?: React.ReactNode
  /** 图表区高度（默认 280） */
  height?: number
  /** 加载态显示骨架 */
  loading?: boolean
  /** 数据为空时显示空态 */
  isEmpty?: boolean
  children: React.ReactNode
  className?: string
}

/** 图表卡片：统一的 header + chart body 容器 */
export function ChartCard({
  title,
  description,
  icon,
  iconAccent = 'primary',
  toolbar,
  height = 280,
  loading,
  isEmpty,
  children,
  className,
}: ChartCardProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card shadow-soft',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border/70 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          {icon && <IconBox icon={icon} accent={iconAccent} size="sm" />}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {toolbar && <div className="shrink-0">{toolbar}</div>}
      </div>
      <div className="p-4" style={{ minHeight: height }}>
        {loading ? (
          <Skeleton className="size-full" style={{ height }} />
        ) : isEmpty ? (
          <EmptyState icon={Inbox} title="暂无数据" />
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </div>
    </div>
  )
}
