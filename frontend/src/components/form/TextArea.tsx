import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/utils/helpers'

export type TextAreaProps = {
  error?: string
  className?: string
} & TextareaHTMLAttributes<HTMLTextAreaElement>

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className, error, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'input-dark resize-none min-h-[100px]',
        error && 'border-neon-red/50 focus:border-neon-red/60',
        className,
      )}
      {...rest}
    />
  )
})
