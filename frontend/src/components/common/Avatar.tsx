import {
  Avatar as UiAvatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export type AvatarProps = {
  src?: string | null
  name?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeClasses = {
  sm: 'size-7 text-[11px]',
  md: 'size-9 text-sm',
  lg: 'size-12 text-lg',
  xl: 'size-16 text-2xl',
}

function getInitial(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  return trimmed[0].toUpperCase()
}

export function Avatar({ src, name = '', size = 'md', className }: AvatarProps) {
  const initial = getInitial(name || '?')
  return (
    <UiAvatar className={cn('rounded-lg', sizeClasses[size], className)}>
      {src ? <AvatarImage src={src} alt={name} className="rounded-lg" /> : null}
      <AvatarFallback className="rounded-lg bg-gradient-to-br from-primary to-pink-500 font-bold text-primary-foreground">
        {initial}
      </AvatarFallback>
    </UiAvatar>
  )
}
