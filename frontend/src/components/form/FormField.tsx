import { type ReactNode } from 'react'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export type FormFieldProps = {
  label?: ReactNode
  error?: string
  hint?: string
  required?: boolean
  htmlFor?: string
  children: ReactNode
  className?: string
}

export function FormField({
  label,
  error,
  hint,
  required,
  htmlFor,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground/90">
          {label}
          {required && (
            <span className="ml-1 text-destructive" aria-hidden>
              *
            </span>
          )}
        </Label>
      )}
      {children}
      {error && <p className="text-xs leading-relaxed text-destructive">{error}</p>}
      {hint && !error && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}
