import * as React from 'react'

import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export type DetailDrawerWidth = 'sm' | 'md' | 'lg' | 'xl'

const widthClass: Record<DetailDrawerWidth, string> = {
  sm: 'sm:max-w-[440px]',
  md: 'sm:max-w-[560px]',
  lg: 'sm:max-w-[720px]',
  xl: 'sm:max-w-[880px]',
}

export type DetailDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  /** 右侧抽屉宽度：sm 440 / md 560 / lg 720 / xl 880 */
  width?: DetailDrawerWidth
  /** 主体内容（建议结构：scroll body + sticky footer） */
  children: React.ReactNode
  /** 底部固定操作区（如 Save / Cancel） */
  footer?: React.ReactNode
  className?: string
  /** 主体内容是否要包一层 padding（默认 true） */
  padded?: boolean
  /**
   * 锁定隐式关闭：为 true 时，点击抽屉外部 / 按 ESC 都不会关闭抽屉
   * （X 按钮、footer 按钮等显式关闭仍有效）。
   * 用于抽屉内打开了更上层的浮层（如图片灯箱）时，避免外层抽屉被一起关掉。
   */
  lockClose?: boolean
}

/** 右侧抽屉，专为 detail/edit 表单设计
 *  - 修复 main flex scroll 陷阱：外层不 overflow-y-auto，body 自滚动
 *  - 三段式：header(shrink-0) + body(min-h-0 flex-1 overflow-y-auto) + footer(shrink-0)
 *  - 默认带 X 关闭按钮（由 SheetContent 自带）
 */
export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  width = 'md',
  children,
  footer,
  className,
  padded = true,
  lockClose = false,
}: DetailDrawerProps) {
  const guard = lockClose
    ? (e: Event) => e.preventDefault()
    : undefined
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        onPointerDownOutside={guard}
        onInteractOutside={guard}
        onEscapeKeyDown={guard}
        className={cn(
          'flex w-full flex-col gap-0 border-l p-0',
          widthClass[width],
          className,
        )}
      >
        <SheetHeader className="shrink-0 border-b border-border bg-card px-5 py-4">
          <SheetTitle className="text-base font-semibold">{title}</SheetTitle>
          {description && (
            <SheetDescription className="text-xs text-muted-foreground">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto',
            padded && 'px-5 py-4',
          )}
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-border bg-card px-5 py-3">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

