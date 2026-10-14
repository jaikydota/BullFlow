import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, X } from 'lucide-react'

import { cn } from '@/lib/utils'

export type SelectOption = {
  value: string
  label: string
  desc?: string
}

export type SelectProps = {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  searchable?: boolean
  className?: string
  disabled?: boolean
  label?: string
  hint?: string
  error?: string
}

const DROPDOWN_MAX_H = 232
const DROPDOWN_OFFSET = 4

export function Select({
  value,
  onChange,
  options,
  placeholder = '请选择…',
  searchable,
  className,
  disabled,
  label,
  hint,
  error,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{
    top?: number
    bottom?: number
    left: number
    width: number
    openUp: boolean
  } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)
  const filtered = query
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.desc?.toLowerCase().includes(query.toLowerCase()),
      )
    : options

  const openDropdown = useCallback(() => {
    if (disabled) return
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return

    const spaceBelow = window.innerHeight - r.bottom
    const spaceAbove = r.top
    const openUp = spaceBelow < DROPDOWN_MAX_H + DROPDOWN_OFFSET && spaceAbove > spaceBelow

    setPos({
      left: r.left,
      width: r.width,
      openUp,
      ...(openUp
        ? { bottom: window.innerHeight - r.top + DROPDOWN_OFFSET }
        : { top: r.bottom + DROPDOWN_OFFSET }),
    })
    setOpen(true)
  }, [disabled])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div className={cn('relative w-full space-y-1.5', className)}>
      {label && (
        <label className="text-sm font-medium text-foreground/90">{label}</label>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        disabled={disabled}
        className={cn(
          'flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow]',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          open && 'border-ring ring-ring/30 ring-[3px]',
          error && 'border-destructive',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span
          className={cn('flex-1 truncate text-left', selected ? 'text-foreground' : 'text-muted-foreground')}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}

      {typeof document !== 'undefined' &&
        open &&
        pos &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              ...(pos.openUp ? { bottom: pos.bottom } : { top: pos.top }),
              left: pos.left,
              width: pos.width,
              zIndex: 9999,
              pointerEvents: 'auto',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
          >
            {searchable && (
              <div className="border-b p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索…"
                    className="w-full rounded-md border border-input bg-transparent py-1.5 pl-8 pr-3 text-sm outline-none focus:border-ring"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">无匹配选项</p>
              ) : (
                filtered.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                      opt.value === value
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{opt.label}</span>
                      {opt.desc && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {opt.desc}
                        </span>
                      )}
                    </span>
                    {opt.value === value && (
                      <Check className="size-3.5 shrink-0 text-primary" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
