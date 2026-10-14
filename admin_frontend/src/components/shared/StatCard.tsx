import { TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { IconBox, type IconBoxAccent } from './IconBox'

export type StatCardProps = {
  title: string
  value: string | number
  icon?: LucideIcon
  iconAccent?: IconBoxAccent
  description?: string
  trend?: {
    value: number
    isPositive: boolean
  }
  className?: string
  /** @deprecated 使用 iconAccent 替代 */
  iconClassName?: string
  onClick?: () => void
}

export function StatCard({
  title,
  value,
  icon: Icon,
  iconAccent = 'primary',
  description,
  trend,
  className,
  onClick,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden card-base p-4 transition-all hover:-translate-y-0.5 hover:shadow-pop hover:border-primary/30',
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* 装饰光斑 */}
      <div className="blob-primary pointer-events-none absolute -top-12 -right-12 size-32 opacity-50 transition-opacity duration-300 group-hover:opacity-80" aria-hidden />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">{title}</p>
          <p className="text-[26px] font-bold leading-tight tracking-tight text-foreground">{value}</p>
          {description && (
            <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1 pt-0.5">
              {trend.isPositive ? (
                <TrendingUp className="size-3 text-emerald-500" strokeWidth={2.4} />
              ) : (
                <TrendingDown className="size-3 text-destructive" strokeWidth={2.4} />
              )}
              <span
                className={cn(
                  'text-xs font-semibold',
                  trend.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
                )}
              >
                {trend.isPositive ? '+' : ''}
                {trend.value}%
              </span>
              <span className="text-xs text-muted-foreground">较上期</span>
            </div>
          )}
        </div>
        {Icon && <IconBox icon={Icon} accent={iconAccent} size="md" />}
      </div>
    </div>
  )
}
