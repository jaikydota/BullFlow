import { createElement, type ComponentType, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type EmptyStateProps = {
  icon?: ReactNode | ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  const isIconComponent =
    typeof icon === 'function' ||
    (typeof icon === 'object' && icon !== null && '$$typeof' in icon && 'render' in icon)

  const IconNode =
    icon && isIconComponent
      ? createElement(icon as ComponentType<{ className?: string }>, { className: 'size-12' })
      : (icon as ReactNode)

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-16 text-center',
        className,
      )}
    >
      {IconNode && (
        <div className="mb-4 flex justify-center text-muted-foreground/60">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted">
            {IconNode}
          </div>
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
