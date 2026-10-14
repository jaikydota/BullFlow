import * as React from 'react'

import { cn } from '@/lib/utils'

export type NumberInputProps = {
  value: number | null | undefined
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  precision?: number
  suffix?: React.ReactNode
  prefix?: React.ReactNode
  placeholder?: string
  disabled?: boolean
  className?: string
  size?: 'sm' | 'md'
}

/** 受控数字输入；失焦自动 clamp 到 [min,max] 并按 precision 取整 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  precision,
  suffix,
  prefix,
  placeholder = '0',
  disabled,
  className,
  size = 'md',
}: NumberInputProps) {
  // 用 string 保留用户输入态（半成品 "1." "0." 等）
  const [text, setText] = React.useState<string>(() =>
    value === null || value === undefined ? '' : String(value),
  )
  React.useEffect(() => {
    setText(value === null || value === undefined ? '' : String(value))
  }, [value])

  const commit = (raw: string) => {
    if (raw === '' || raw === '-') {
      onChange(min ?? 0)
      setText(String(min ?? 0))
      return
    }
    let n = Number(raw)
    if (Number.isNaN(n)) {
      onChange(min ?? 0)
      setText(String(min ?? 0))
      return
    }
    if (typeof min === 'number' && n < min) n = min
    if (typeof max === 'number' && n > max) n = max
    if (typeof precision === 'number') {
      const factor = Math.pow(10, precision)
      n = Math.round(n * factor) / factor
    }
    onChange(n)
    setText(String(n))
  }

  return (
    <div
      className={cn(
        'flex items-center rounded-md border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15',
        size === 'sm' ? 'h-8 text-sm' : 'h-9 text-sm',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      {prefix && (
        <span className="shrink-0 select-none border-r border-border px-2 text-xs text-muted-foreground">
          {prefix}
        </span>
      )}
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        className={cn(
          'h-full w-full bg-transparent px-2.5 outline-none placeholder:text-muted-foreground/60',
          // 隐藏原生 spinner
          '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
        )}
      />
      {suffix && (
        <span className="shrink-0 select-none border-l border-border px-2 text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}
