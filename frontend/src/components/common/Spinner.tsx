import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl'

export type SpinnerProps = {
  size?: SpinnerSize
  className?: string
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-8',
  xl: 'size-12',
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <Loader2
      role="status"
      aria-label="Loading"
      className={cn('animate-spin text-primary', sizeClasses[size], className)}
    />
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-accent', className)}
    />
  )
}
