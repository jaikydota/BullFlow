import { type ReactNode } from 'react'

import { Badge as UiBadge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// color API（cyan / green / purple 等色名）
export type BadgeColor = 'cyan' | 'green' | 'purple' | 'amber' | 'red' | 'pink' | 'muted' | 'neutral'
// variant + size API
export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'secondary'
  | 'muted'
export type BadgeSize = 'sm' | 'md' | 'lg'

export type BadgeProps = {
  color?: BadgeColor
  variant?: BadgeVariant
  size?: BadgeSize
  children: ReactNode
  className?: string
  title?: string
}

const colorClasses: Record<BadgeColor, string> = {
  cyan: 'bg-primary/10 text-primary border-primary/20',
  green: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
  purple: 'bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-400',
  amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
  red: 'bg-destructive/10 text-destructive border-destructive/20',
  pink: 'bg-pink-500/10 text-pink-600 border-pink-500/20 dark:text-pink-400',
  muted: 'bg-muted text-muted-foreground border-border',
  neutral: 'bg-muted text-muted-foreground border-border',
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-primary/10 text-primary border-primary/20',
  success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
  danger: 'bg-destructive/10 text-destructive border-destructive/20',
  info: 'bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-400',
  secondary: 'bg-secondary text-secondary-foreground border-border',
  muted: 'bg-muted text-muted-foreground border-border',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-1.5 py-0',
  md: 'text-xs px-2 py-0.5',
  lg: 'text-sm px-2.5 py-1',
}

export function Badge({
  color,
  variant,
  size = 'md',
  children,
  className,
  title,
}: BadgeProps) {
  const palette = variant ? variantClasses[variant] : colorClasses[color ?? 'muted']
  return (
    <UiBadge
      variant="outline"
      title={title}
      className={cn('font-medium', palette, sizeClasses[size], className)}
    >
      {children}
    </UiBadge>
  )
}
