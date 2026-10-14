import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type IconBoxAccent =
  | 'primary'
  | 'article'
  | 'image'
  | 'video'
  | 'audio'
  | 'success'
  | 'info'
  | 'warning'
  | 'rose'
  | 'neutral'

export type IconBoxSize = 'sm' | 'md' | 'lg' | 'xl'

const accentStyles: Record<IconBoxAccent, string> = {
  primary: 'from-primary/20 to-pink-500/20 text-primary border-primary/25',
  article: 'from-blue-500/25 to-cyan-500/25 text-blue-600 dark:text-blue-400 border-blue-500/30',
  image: 'from-emerald-500/20 to-primary/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
  video: 'from-rose-500/20 to-amber-500/20 text-rose-600 dark:text-rose-400 border-rose-500/25',
  audio: 'from-sky-500/20 to-violet-500/20 text-sky-600 dark:text-sky-400 border-sky-500/25',
  success: 'from-emerald-500/20 to-teal-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
  info: 'from-sky-500/20 to-primary/20 text-sky-600 dark:text-sky-400 border-sky-500/25',
  warning: 'from-amber-500/20 to-orange-500/20 text-amber-600 dark:text-amber-400 border-amber-500/25',
  rose: 'from-rose-500/20 to-pink-500/20 text-rose-600 dark:text-rose-400 border-rose-500/25',
  neutral: 'from-muted to-muted text-muted-foreground border-border',
}

const sizeStyles: Record<IconBoxSize, { box: string; icon: string }> = {
  sm: { box: 'size-8 rounded-lg', icon: 'size-4' },
  md: { box: 'size-11 rounded-xl', icon: 'size-5' },
  lg: { box: 'size-12 rounded-xl', icon: 'size-[22px]' },
  xl: { box: 'size-14 rounded-2xl', icon: 'size-6' },
}

export type IconBoxProps = {
  icon: LucideIcon
  accent?: IconBoxAccent
  size?: IconBoxSize
  className?: string
  iconClassName?: string
}

export function IconBox({
  icon: Icon,
  accent = 'primary',
  size = 'md',
  className,
  iconClassName,
}: IconBoxProps) {
  const { box, icon: iconSize } = sizeStyles[size]
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center border bg-gradient-to-br shadow-xs',
        box,
        accentStyles[accent],
        className,
      )}
    >
      <Icon className={cn(iconSize, iconClassName)} strokeWidth={2.25} />
    </div>
  )
}
