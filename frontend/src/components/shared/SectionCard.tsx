import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconBox, type IconBoxAccent } from './IconBox'

export type SectionCardVariant = 'default' | 'elevated' | 'gradient' | 'plain'

export type SectionCardProps = {
  title?: React.ReactNode
  description?: React.ReactNode
  icon?: LucideIcon
  iconAccent?: IconBoxAccent
  actions?: React.ReactNode
  variant?: SectionCardVariant
  /** 是否带渐变光斑装饰（gradient/elevated 默认开启） */
  decorate?: boolean
  /** 自定义容器 padding，默认 p-6 */
  bodyClassName?: string
  headerClassName?: string
  className?: string
  children?: React.ReactNode
}

const variantStyles: Record<SectionCardVariant, string> = {
  default: 'card-base',
  elevated: 'card-elevated',
  gradient: 'gradient-border shadow-card',
  plain: 'rounded-xl border border-border bg-card',
}

export function SectionCard({
  title,
  description,
  icon,
  iconAccent = 'primary',
  actions,
  variant = 'default',
  decorate,
  bodyClassName,
  headerClassName,
  className,
  children,
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || actions || icon)
  const showDecor = decorate ?? (variant === 'gradient' || variant === 'elevated')

  return (
    <div className={cn('relative overflow-hidden', variantStyles[variant], className)}>
      {showDecor && (
        <>
          <div className="blob-primary pointer-events-none absolute -top-24 -right-24 size-64 opacity-60" aria-hidden />
          {variant === 'gradient' && (
            <div className="blob-rose pointer-events-none absolute -bottom-24 -left-16 size-56 opacity-50" aria-hidden />
          )}
        </>
      )}
      {hasHeader && (
        <div
          className={cn(
            'relative z-10 flex items-start justify-between gap-4 border-b border-border/60 px-6 py-4',
            headerClassName,
          )}
        >
          <div className="flex min-w-0 items-start gap-3">
            {icon && <IconBox icon={icon} accent={iconAccent} size="sm" />}
            <div className="min-w-0 space-y-0.5">
              {title && (
                <div className="text-sm font-semibold tracking-tight text-foreground">{title}</div>
              )}
              {description && (
                <div className="text-xs leading-relaxed text-muted-foreground">{description}</div>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('relative z-10', bodyClassName ?? 'p-6')}>{children}</div>
    </div>
  )
}
