import { useEffect, useId, useState } from 'react'
import { cn } from '@/utils/helpers'

const DEFAULT_PRESETS = [
  '#4f46e5',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
  '#0f172a',
  '#ffffff',
]

function normalizeHex(input: string): string | null {
  const s = input.trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toLowerCase()
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return `#${s.toLowerCase()}`
  return null
}

export type ColorPickerProps = {
  value: string
  onChange: (color: string) => void
  presets?: string[]
  className?: string
}

export function ColorPicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  className,
}: ColorPickerProps) {
  const id = useId()
  const [hexDraft, setHexDraft] = useState(value)

  const displayValue = normalizeHex(value) ?? '#000000'

  useEffect(() => {
    setHexDraft(value)
  }, [value])

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center', className)}>
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="sr-only">
          Pick color
        </label>
        <input
          id={id}
          type="color"
          value={displayValue}
          onChange={(e) => {
            const v = e.target.value
            setHexDraft(v)
            onChange(v)
          }}
          className="h-11 w-14 cursor-pointer rounded-xl border border-white/[0.12] bg-bg-surface p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/30"
        />
        <input
          type="text"
          value={hexDraft}
          onChange={(e) => {
            const next = e.target.value
            setHexDraft(next)
            const n = normalizeHex(next)
            if (n) onChange(n)
          }}
          onBlur={() => {
            const n = normalizeHex(hexDraft)
            if (n) {
              setHexDraft(n)
              onChange(n)
            } else {
              setHexDraft(displayValue)
            }
          }}
          spellCheck={false}
          className={cn(
            'w-28 rounded-xl border border-white/[0.12] bg-bg-surface/50 px-3 py-2 font-mono text-sm text-text-primary',
            'focus:border-neon-cyan/40 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20',
          )}
          aria-label="Hex color"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((c) => {
          const hex = normalizeHex(c) ?? c
          const selected = displayValue.toLowerCase() === hex.toLowerCase()
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                setHexDraft(hex)
                onChange(hex)
              }}
              className={cn(
                'size-8 cursor-pointer rounded-xl border shadow-xs transition-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                selected ? 'ring-2 ring-neon-cyan ring-offset-bg-deep' : 'border-white/[0.12] hover:ring-2 hover:ring-white/20',
              )}
              style={{ backgroundColor: hex }}
              title={hex}
              aria-label={`Preset ${hex}`}
            />
          )
        })}
      </div>
    </div>
  )
}
