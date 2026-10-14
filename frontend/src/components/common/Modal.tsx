import { type ReactNode } from 'react'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

export type ModalProps = {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: ModalSize
  className?: string
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  className,
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          'flex max-h-[min(90dvh,720px)] flex-col gap-0 overflow-hidden p-0',
          sizeClasses[size],
          className,
        )}
      >
        {title && (
          <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
            <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          </DialogHeader>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <DialogFooter className="shrink-0 border-t px-6 py-4">{footer}</DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
