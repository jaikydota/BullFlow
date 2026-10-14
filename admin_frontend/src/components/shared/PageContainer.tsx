import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * 所有页面默认铺满 main 区域，仅靠 main 自身 padding 留边距；`md` / `lg` / `xl` 与 `full` 等效。
 * 仅极少数特殊场景（如登录页双侧栏）可显式 `size="sm"` 收窄，
 * 默认请省略 size，或始终用 `full`。
 */
export type PageContainerSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

const sizeMap: Record<PageContainerSize, string> = {
  sm: 'max-w-3xl',
  md: 'max-w-none',
  lg: 'max-w-none',
  xl: 'max-w-none',
  full: 'max-w-none',
}

export type PageContainerProps = {
  /** @deprecated 默认全宽即可，仅 `sm` 仍会收窄；其它枚举值已统一映射为全宽 */
  size?: PageContainerSize
  className?: string
  children: React.ReactNode
}

export function PageContainer({ size = 'full', className, children }: PageContainerProps) {
  return (
    <div className={cn('w-full pb-12 md:pb-16', sizeMap[size], size === 'sm' && 'mx-auto', className)}>
      {children}
    </div>
  )
}
