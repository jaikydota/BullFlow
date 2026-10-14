import * as React from 'react'
import { cn } from '@/lib/utils'

export type GradientHeroTone = 'primary' | 'sunset' | 'forest' | 'ocean' | 'aurora'

const toneStyles: Record<
  GradientHeroTone,
  { wrapper: string; title: string; blobs: [string, string] }
> = {
  primary: {
    wrapper: 'from-primary/10 via-fuchsia-500/8 to-pink-500/10',
    title: 'from-primary via-fuchsia-500 to-pink-500',
    blobs: ['blob-primary', 'blob-rose'],
  },
  sunset: {
    wrapper: 'from-amber-400/12 via-rose-400/10 to-fuchsia-500/10',
    title: 'from-amber-500 via-rose-500 to-fuchsia-500',
    blobs: ['blob-amber', 'blob-rose'],
  },
  forest: {
    wrapper: 'from-emerald-400/10 via-teal-400/10 to-sky-400/8',
    title: 'from-emerald-500 via-teal-500 to-sky-500',
    blobs: ['blob-emerald', 'blob-sky'],
  },
  ocean: {
    wrapper: 'from-sky-400/10 via-primary/10 to-violet-500/10',
    title: 'from-sky-500 via-primary to-violet-500',
    blobs: ['blob-sky', 'blob-primary'],
  },
  aurora: {
    wrapper: 'from-emerald-400/8 via-primary/10 to-rose-400/10',
    title: 'from-emerald-500 via-primary to-rose-500',
    blobs: ['blob-emerald', 'blob-primary'],
  },
}

export type GradientHeroProps = {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  tone?: GradientHeroTone
  blobs?: boolean
  animated?: boolean
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

export function GradientHero({
  title,
  description,
  eyebrow,
  tone = 'primary',
  blobs = true,
  animated = true,
  actions,
  children,
  className,
}: GradientHeroProps) {
  const t = toneStyles[tone]
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br p-6 shadow-card sm:p-8',
        t.wrapper,
        className,
      )}
    >
      {blobs && (
        <>
          <div
            className={cn(
              t.blobs[0],
              'size-72 -top-24 -left-16 opacity-70',
              animated && 'animate-blob',
            )}
            aria-hidden
          />
          <div
            className={cn(
              t.blobs[1],
              'size-72 -bottom-24 -right-16 opacity-60',
              animated && 'animate-blob',
            )}
            style={animated ? { animationDelay: '8s' } : undefined}
            aria-hidden
          />
        </>
      )}
      <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2.5">
          {eyebrow && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
              {eyebrow}
            </div>
          )}
          <h1
            className={cn(
              'bg-gradient-to-r bg-clip-text text-2xl font-bold leading-tight tracking-tight text-transparent sm:text-3xl',
              t.title,
            )}
          >
            {title}
          </h1>
          {description && (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="relative z-10 mt-6">{children}</div>}
    </div>
  )
}
