import { forwardRef, useId, type InputHTMLAttributes } from 'react'

import { Input as UiInput } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export type InputProps = {
  label?: string
  hint?: string
  error?: string
  className?: string
} & InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, id: propId, ...rest },
  ref,
) {
  const reactId = useId()
  const inputId = propId ?? reactId

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <Label htmlFor={inputId} className="text-sm font-medium text-foreground/90">
          {label}
        </Label>
      )}
      <UiInput
        id={inputId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        className={cn(error && 'border-destructive focus-visible:ring-destructive/20', className)}
        {...rest}
      />
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
})
