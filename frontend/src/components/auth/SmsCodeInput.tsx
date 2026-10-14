import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface SmsCodeInputProps {
  value: string
  onChange: (v: string) => void
  onSend: () => Promise<void> | void
  /** 发送按钮在何种情况下置为可点（手机号校验通过等） */
  canSend: boolean
  /** 倒计时秒数，默认 60 */
  cooldownSeconds?: number
  disabled?: boolean
  id?: string
}

/**
 * 验证码输入 + 内嵌「发送/重发(60s)」按钮。
 * 父组件负责实际调用 API（onSend），本组件管理倒计时状态。
 */
export function SmsCodeInput({
  value,
  onChange,
  onSend,
  canSend,
  cooldownSeconds = 60,
  disabled,
  id = 'sms-code',
}: SmsCodeInputProps) {
  const [remaining, setRemaining] = useState(0)
  const [sending, setSending] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const startCooldown = () => {
    setRemaining(cooldownSeconds)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return r - 1
      })
    }, 1000)
  }

  const handleSend = async () => {
    if (sending || remaining > 0 || !canSend) return
    setSending(true)
    try {
      await onSend()
      startCooldown()
    } catch {
      // 错误已由父组件 toast 提示
    } finally {
      setSending(false)
    }
  }

  const buttonLabel = sending
    ? '发送中…'
    : remaining > 0
      ? `${remaining} s`
      : '发送验证码'

  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="6 位验证码"
        maxLength={6}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className={cn(
          'flex-1 tabular-nums',
          // 输入时拉开字间距让数字醒目，placeholder 仍紧凑显示
          value.length > 0 && 'tracking-[0.4em] text-center font-semibold',
        )}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || sending || remaining > 0 || !canSend}
        onClick={() => void handleSend()}
        className={cn(
          'h-10 w-[104px] shrink-0 cursor-pointer text-sm font-normal tabular-nums',
          remaining > 0 && 'text-muted-foreground',
        )}
      >
        {buttonLabel}
      </Button>
    </div>
  )
}
