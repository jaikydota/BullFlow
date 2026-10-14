import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type PaginationProps = {
  page: number
  /** 总页数；不传则由 total/pageSize 推算 */
  pages?: number
  total: number
  pageSize: number
  onChange: (page: number) => void
  className?: string
}

export function Pagination({
  page,
  pages: pagesProp,
  total,
  pageSize,
  onChange,
  className,
}: PaginationProps) {
  const pages = pagesProp ?? Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  if (pages <= 1) return null

  const start = Math.min((page - 1) * pageSize + 1, total)
  const end = Math.min(page * pageSize, total)

  const getRange = () => {
    const delta = 2
    const range: (number | '...')[] = []
    const left = Math.max(2, page - delta)
    const right = Math.min(pages - 1, page + delta)

    range.push(1)
    if (left > 2) range.push('...')
    for (let i = left; i <= right; i++) range.push(i)
    if (right < pages - 1) range.push('...')
    if (pages > 1) range.push(pages)
    return range
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-xs text-muted-foreground font-mono">
        {start}–{end} / {total}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous"
        >
          <ChevronLeft className="size-4" />
        </Button>
        {getRange().map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-1 text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={p}
              type="button"
              variant={p === page ? 'outline' : 'ghost'}
              size="icon-sm"
              onClick={() => onChange(p as number)}
              className={cn(p === page && 'border-primary text-primary bg-primary/10')}
            >
              {p}
            </Button>
          ),
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          aria-label="Next"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
