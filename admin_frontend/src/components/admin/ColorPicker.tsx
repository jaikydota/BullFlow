import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

/** 8 种内置渐变色（用于通知 banner / 强调卡） */
export const GRADIENT_PALETTE = [
  { code: 'primary', label: '紫', from: 'from-violet-500', to: 'to-purple-500' },
  { code: 'sky', label: '天蓝', from: 'from-sky-500', to: 'to-cyan-500' },
  { code: 'ocean', label: '海蓝', from: 'from-blue-600', to: 'to-indigo-500' },
  { code: 'emerald', label: '青绿', from: 'from-emerald-500', to: 'to-teal-500' },
  { code: 'forest', label: '森林', from: 'from-lime-500', to: 'to-green-600' },
  { code: 'sunset', label: '日落', from: 'from-amber-500', to: 'to-orange-500' },
  { code: 'berry', label: '莓红', from: 'from-pink-500', to: 'to-rose-500' },
  { code: 'midnight', label: '深夜', from: 'from-slate-700', to: 'to-zinc-900' },
] as const

export type GradientCode = (typeof GRADIENT_PALETTE)[number]['code']

export type ColorPickerProps = {
  value: GradientCode | null | undefined
  onChange: (code: GradientCode) => void
  className?: string
  /** 显示色块标签（默认 true） */
  showLabel?: boolean
}

/** 渐变色板选择器 */
export function ColorPicker({ value, onChange, className, showLabel = true }: ColorPickerProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {GRADIENT_PALETTE.map((c) => {
        const selected = c.code === value
        return (
          <button
            key={c.code}
            type="button"
            onClick={() => onChange(c.code)}
            title={c.label}
            className={cn(
              'group flex flex-col items-center gap-1 cursor-pointer transition-transform hover:-translate-y-0.5',
            )}
          >
            <span
              className={cn(
                'relative flex size-10 items-center justify-center rounded-lg bg-gradient-to-br shadow-soft transition-shadow',
                c.from,
                c.to,
                selected && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
              )}
            >
              {selected && (
                <Check className="size-5 text-white drop-shadow" strokeWidth={2.5} />
              )}
            </span>
            {showLabel && (
              <span
                className={cn(
                  'text-[10px]',
                  selected ? 'font-semibold text-primary' : 'text-muted-foreground',
                )}
              >
                {c.label}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
