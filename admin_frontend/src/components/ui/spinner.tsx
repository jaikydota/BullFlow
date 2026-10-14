import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

type SpinnerProps = {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeMap = {
  sm: 'size-3',
  md: 'size-4',
  lg: 'size-6',
  xl: 'size-8',
}

export function Spinner({ className, size = 'md' }: SpinnerProps) {
  return (
    <Loader2
      className={cn('animate-spin text-primary', sizeMap[size], className)}
    />
  )
}
