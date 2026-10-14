import { AlertCircle, AlertTriangle, Info, Loader2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ConfirmDialogVariant = 'danger' | 'warning' | 'default'

export type ConfirmDialogProps = {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: ConfirmDialogVariant
  loading?: boolean
  onConfirm: () => void
  onCancel?: () => void
  onClose?: () => void
}

const variantConfig = {
  danger: {
    Icon: AlertCircle,
    iconClass: 'text-destructive',
    iconBg: 'bg-destructive/10 border-destructive/20',
    actionVariant: 'destructive' as const,
  },
  warning: {
    Icon: AlertTriangle,
    iconClass: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-500/10 border-amber-500/20',
    actionVariant: 'default' as const,
  },
  default: {
    Icon: Info,
    iconClass: 'text-primary',
    iconBg: 'bg-primary/10 border-primary/20',
    actionVariant: 'default' as const,
  },
}

export function ConfirmDialog({
  open,
  title = '操作确认',
  message,
  confirmText = '确定',
  cancelText = '取消',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
  onClose,
}: ConfirmDialogProps) {
  const handleCancel = onCancel ?? onClose ?? (() => {})
  const cfg = variantConfig[variant]

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && handleCancel()}>
      <AlertDialogContent className="z-[60]">
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl border',
                cfg.iconBg,
              )}
            >
              <cfg.Icon className={cn('size-5', cfg.iconClass)} />
            </div>
            <div className="min-w-0 flex-1">
              <AlertDialogTitle className="text-base">{title}</AlertDialogTitle>
              <AlertDialogDescription className="mt-1.5">{message}</AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading} className="cursor-pointer">
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={onConfirm}
            className={cn(buttonVariants({ variant: cfg.actionVariant }), 'cursor-pointer')}
          >
            {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
