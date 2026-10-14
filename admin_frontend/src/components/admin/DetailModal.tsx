import * as React from 'react'

import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type DetailModalSize = 'sm' | 'md' | 'lg' | 'xl'

const sizeClass: Record<DetailModalSize, string> = {
  sm: 'sm:max-w-[420px]',
  md: 'sm:max-w-[560px]',
  lg: 'sm:max-w-[720px]',
  xl: 'sm:max-w-[880px]',
}

export type DetailModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  size?: DetailModalSize
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  padded?: boolean
}

/** 居中弹窗，专为 confirm / quick edit 场景设计
 *  shadcn Dialog 默认 `display: grid` 会破坏 flex+overflow-y-auto，
 *  这里用 flex flex-col 覆盖，body 区自滚动；max-h 90vh 防止超屏 */
export function DetailModal({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  children,
  footer,
  className,
  padded = true,
}: DetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0',
          sizeClass[size],
          className,
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border bg-card px-5 py-4">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-xs text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  )
}
