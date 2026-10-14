import * as React from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export type ButtonGroupOption<T extends string> = {
  value: T
  label: React.ReactNode
  icon?: LucideIcon
  disabled?: boolean
}

export type ButtonGroupProps<T extends string> = {
  options: ButtonGroupOption<T>[]
  value: T | null | undefined
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  fullWidth?: boolean
  className?: string
}

/** 分段控件（segmented control）：horizontal 按钮组，单选高亮当前
 *  适合场景：类型切换、时间范围、计费模式 等 2–6 选项的互斥选择 */
export function ButtonGroup<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  fullWidth,
  className,
}: ButtonGroupProps<T>) {
  return (
    <div
      role="radiogroup"
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-muted/30 p-0.5',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[5px] font-medium transition-all',
              size === 'sm' ? 'h-7 px-3 text-xs' : 'h-8 px-3.5 text-sm',
              fullWidth && 'flex-1',
              active
                ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground',
              opt.disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {Icon && <Icon className="size-3.5" strokeWidth={2.25} />}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
