import * as React from 'react'

import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

export type ProFormLayout = '1-col' | '2-col' | '3-col'

export type ProFormProps = React.FormHTMLAttributes<HTMLFormElement> & {
  layout?: ProFormLayout
  /** 底部按钮区，sticky 在 form 容器底部；若放在 Drawer 内由 Drawer footer 接管 */
  footer?: React.ReactNode
  /** 内容区是否需要 scroll（在 Modal/Drawer 内一般 true）*/
  scrollable?: boolean
  /** 内容区类名 */
  bodyClassName?: string
}

/** 通用表单容器：响应式 grid 布局 + 可选 sticky 底部操作栏 */
export function ProForm({
  layout = '1-col',
  footer,
  scrollable,
  children,
  bodyClassName,
  className,
  ...rest
}: ProFormProps) {
  return (
    <form
      {...rest}
      className={cn('flex h-full min-h-0 flex-col', className)}
    >
      <div
        className={cn(
          scrollable && 'min-h-0 flex-1 overflow-y-auto',
          'space-y-4',
          bodyClassName,
        )}
      >
        <div
          className={cn(
            'grid gap-x-4 gap-y-4',
            layout === '1-col' && 'grid-cols-1',
            layout === '2-col' && 'grid-cols-1 sm:grid-cols-2',
            layout === '3-col' && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
          )}
        >
          {children}
        </div>
      </div>
      {footer && (
        <div className="shrink-0 border-t border-border bg-card px-1 pt-3">
          {footer}
        </div>
      )}
    </form>
  )
}

export type ProFormFieldProps = {
  label?: React.ReactNode
  required?: boolean
  hint?: React.ReactNode
  error?: React.ReactNode
  children: React.ReactNode
  /** 占满整行（2-col / 3-col 布局下） */
  fullWidth?: boolean
  className?: string
}

/** 单字段：Label + children + hint + error 统一间距 */
export function ProFormField({
  label,
  required,
  hint,
  error,
  children,
  fullWidth,
  className,
}: ProFormFieldProps) {
  return (
    <div className={cn('space-y-1.5', fullWidth && 'col-span-full', className)}>
      {label && (
        <Label className="flex items-center gap-1 text-[13px] font-medium text-foreground">
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/** 区域标题：在 form 内分段（如"基础信息""高级设置"） */
export function ProFormSection({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3 pt-2', className)}>
      <div className="flex items-baseline justify-between border-b border-border/70 pb-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
      {children}
    </section>
  )
}
