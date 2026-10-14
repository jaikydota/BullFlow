import * as React from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { IconBox, type IconBoxAccent } from './IconBox'

export type BreadcrumbItem = {
  label: string
  href?: string
}

export type PageHeaderProps = {
  title: string
  description?: string
  breadcrumbs?: BreadcrumbItem[]
  actions?: React.ReactNode
  icon?: LucideIcon
  iconAccent?: IconBoxAccent
  /** 是否在标题上方显示一个 eyebrow chip */
  eyebrow?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  icon: Icon,
  iconAccent = 'primary',
  eyebrow,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6 space-y-3', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {breadcrumbs.map((item, index) => (
            <span key={index} className="flex items-center gap-1.5">
              {index > 0 && <ChevronRight className="size-3 opacity-60" strokeWidth={2.25} />}
              {item.href ? (
                <Link
                  to={item.href}
                  className="cursor-pointer transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-foreground/80">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {Icon && <IconBox icon={Icon} accent={iconAccent} size="md" />}
          <div className="min-w-0 space-y-1">
            {eyebrow && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                {eyebrow}
              </div>
            )}
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
              {title}
            </h1>
            {description && (
              <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
