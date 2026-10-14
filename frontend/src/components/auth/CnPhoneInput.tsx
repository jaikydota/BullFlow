import { useId } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface CnPhoneInputProps {
  value: string                       // 仅 11 位号码（不含 +86）
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
  autoFocus?: boolean
  id?: string
  required?: boolean
}

/**
 * 中国大陆固定 +86 前缀的手机号输入框。
 * 仅接收 11 位数字。
 */
export function CnPhoneInput({
  value,
  onChange,
  disabled,
  placeholder = '请输入 11 位手机号',
  autoFocus,
  id,
  required,
}: CnPhoneInputProps) {
  const fallbackId = useId()
  const inputId = id ?? fallbackId
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold tabular-nums text-foreground/80">
        +86
      </div>
      <span
        className="pointer-events-none absolute inset-y-0 left-[3.25rem] flex items-center"
        aria-hidden
      >
        <span className="h-4 w-px bg-border" />
      </span>
      <Input
        id={inputId}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 11))}
        className={cn('pl-16 tracking-wider tabular-nums')}
      />
    </div>
  )
}

export function isCnPhoneValid(v: string): boolean {
  return /^1[3-9]\d{9}$/.test(v)
}

/** 转成梦网 mobile 字段：86 + 11 位号码 */
export function cnPhoneToE164(v: string): string {
  return '86' + v
}
