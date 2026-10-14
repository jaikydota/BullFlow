import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * 生成页表单字段的统一标题：左侧主题色竖条 + 半粗体正文色，
 * 强化标题可见性、加大各字段之间的视觉分隔。
 */
export function FieldLabel({
  children,
  optional,
  className,
  htmlFor,
}: {
  children: ReactNode
  optional?: boolean
  className?: string
  htmlFor?: string
}) {
  return (
    <label htmlFor={htmlFor} className={cn('flex items-center gap-2 text-[13px] font-semibold text-foreground', className)}>
      <span className="h-3.5 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary to-primary/40" aria-hidden />
      <span>{children}</span>
      {optional && <span className="text-xs font-normal text-muted-foreground">(可选)</span>}
    </label>
  )
}
