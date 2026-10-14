import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import { Button as UiButton, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ButtonVariant =
  | 'primary'
  | 'accent'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'outline'
  | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  className?: string
  children?: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

type UiVariant = NonNullable<Parameters<typeof buttonVariants>[0]>['variant']
type UiSize = NonNullable<Parameters<typeof buttonVariants>[0]>['size']

const variantMap: Record<ButtonVariant, UiVariant> = {
  primary: 'default',
  accent: 'default',
  secondary: 'secondary',
  ghost: 'ghost',
  // danger 走 outline 基础样式 + 自定义红色描边 / 红色文字 / 淡红 hover 背景；
  // ConfirmDialog 的"确认删除"按钮不走 common/Button，仍是 destructive 实色（强提示）
  danger: 'outline',
  outline: 'outline',
  link: 'link',
}

const accentClass = 'bg-emerald-500 text-white hover:bg-emerald-600'
// 红色文字 + 红色描边，hover 淡红色背景（不用实色红底，避免列表行内过分抢眼）
const dangerClass =
  'border-rose-500/40 bg-transparent text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 hover:border-rose-500/60 dark:text-rose-400 dark:hover:text-rose-400 dark:hover:bg-rose-500/15'

const sizeMap: Record<ButtonSize, UiSize> = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = Boolean(disabled || loading)
  return (
    <UiButton
      ref={ref}
      type={type}
      disabled={isDisabled}
      variant={variantMap[variant]}
      size={sizeMap[size]}
      aria-busy={loading || undefined}
      className={cn(
        variant === 'accent' && accentClass,
        variant === 'danger' && dangerClass,
        className,
      )}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </UiButton>
  )
})
