/* eslint-disable react-refresh/only-export-components -- toast helpers are used together with <Toaster /> */
import toastBase, {
  Toaster as HotToaster,
  type ToastOptions,
  type ToasterProps,
} from 'react-hot-toast'

import { cn } from '@/lib/utils'

type ToastMessage = Parameters<typeof toastBase.success>[0]

const baseClass =
  'rounded-lg border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-md ' +
  // 允许多行 + 中英文长串正确换行；max-w-md 兜底，避免超长
  '!max-w-md whitespace-normal break-words leading-relaxed'

// react-hot-toast 默认外层容器 max-width: 350px，长错误信息会被截断。
// 通过 style 兜底放宽（同步 baseClass !max-w-md = 28rem ≈ 448px）。
const baseStyle = { maxWidth: '28rem' as const }

function mergeOptions(extraClassName: string, options?: ToastOptions): ToastOptions {
  return {
    duration: 4000,
    ...options,
    className: cn(baseClass, extraClassName, options?.className),
    style: { ...baseStyle, ...(options?.style ?? {}) },
  }
}

export const toast = {
  success: (message: ToastMessage, options?: ToastOptions) =>
    toastBase.success(
      message,
      mergeOptions('border-emerald-200 dark:border-emerald-900', options),
    ),
  error: (message: ToastMessage, options?: ToastOptions) =>
    toastBase.error(
      message,
      mergeOptions('border-destructive/30 text-destructive', options),
    ),
  loading: (message: ToastMessage, options?: ToastOptions) =>
    toastBase.loading(message, mergeOptions('border-border', options)),
  dismiss: toastBase.dismiss,
  promise: toastBase.promise,
  custom: toastBase.custom,
}

export function Toaster(props: ToasterProps) {
  return (
    <HotToaster
      position="top-right"
      gutter={12}
      toastOptions={{
        duration: 4000,
        className: baseClass,
        style: baseStyle,
        success: { className: cn(baseClass, 'border-emerald-200 dark:border-emerald-900'), style: baseStyle },
        error: { className: cn(baseClass, 'border-destructive/30 text-destructive'), style: baseStyle },
        loading: { className: cn(baseClass, 'border-border'), style: baseStyle },
      }}
      {...props}
    />
  )
}
