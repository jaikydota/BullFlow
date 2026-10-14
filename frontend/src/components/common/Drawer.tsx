import { type ReactNode } from 'react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type DrawerPosition = 'left' | 'right' | 'bottom'

export type DrawerProps = {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  position?: DrawerPosition
  width?: string
  className?: string
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  position = 'right',
  width,
  className,
}: DrawerProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={position}
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          (position === 'left' || position === 'right') && 'sm:max-w-md',
          className,
        )}
        style={width && (position === 'left' || position === 'right') ? { width, maxWidth: width } : undefined}
      >
        {title && (
          <SheetHeader className="shrink-0 border-b px-5 py-3.5">
            <SheetTitle className="text-base">{title}</SheetTitle>
          </SheetHeader>
        )}
        {/* 不在此处加滚动；交由子内容自行管理（避免 overflow-y 裁掉 input 焦点环） */}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
