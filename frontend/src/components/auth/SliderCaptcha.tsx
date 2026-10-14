import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, RefreshCw } from 'lucide-react'

import { captchaApi, type SliderData } from '@/api/captcha'
import { toast } from '@/components/common/Toast'
import { ApiError } from '@/types/api'
import { cn } from '@/lib/utils'

type Status = 'idle' | 'verifying' | 'fail' | 'ok'

/**
 * 自研滑块拼图验证：拖动底部滑块让拼图块对齐缺口，松手后向后端校验，
 * 通过即回调 onSuccess(ticket)。失败自动换一道新题。
 */
export function SliderCaptcha({ onSuccess }: { onSuccess: (ticket: string) => void }) {
  const { t } = useTranslation()
  const [data, setData] = useState<SliderData | null>(null)
  const [sliderX, setSliderX] = useState(0)
  const [status, setStatus] = useState<Status>('idle')
  const [loadErr, setLoadErr] = useState(false)
  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const sliderXRef = useRef(0)

  const load = useCallback(async () => {
    setStatus('idle')
    setSliderX(0)
    sliderXRef.current = 0
    setLoadErr(false)
    try {
      const d = await captchaApi.getSlider()
      setData(d)
    } catch {
      setLoadErr(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleWidth = data?.pieceSize ?? 50
  const maxX = data ? data.width - handleWidth : 0

  const onPointerDown = (e: React.PointerEvent) => {
    if (!data || status === 'verifying' || status === 'ok') return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    draggingRef.current = true
    startXRef.current = e.clientX - sliderX
    if (status === 'fail') setStatus('idle')
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !data) return
    let nx = e.clientX - startXRef.current
    nx = Math.max(0, Math.min(maxX, nx))
    sliderXRef.current = nx
    setSliderX(nx)
  }

  const onPointerUp = async () => {
    if (!draggingRef.current || !data) return
    draggingRef.current = false
    setStatus('verifying')
    try {
      const { ticket } = await captchaApi.verify({
        captchaId: data.captchaId,
        x: Math.round(sliderXRef.current),
      })
      setStatus('ok')
      setTimeout(() => onSuccess(ticket), 250)
    } catch (e) {
      setStatus('fail')
      if (e instanceof ApiError && e.code === 42900) {
        // 失败次数过多被锁定：提示用户等待，稍后再换题
        toast.error(e.message)
        setTimeout(() => void load(), 1500)
      } else {
        // 普通校验失败：标红并自动换一道新题
        setTimeout(() => void load(), 600)
      }
    }
  }

  if (loadErr) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-sm text-muted-foreground">{t('captcha.loadError', '验证加载失败')}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className="size-4" /> {t('captcha.retry', '重试')}
        </button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        {t('captcha.loading', '加载中…')}
      </div>
    )
  }

  return (
    <div className="mx-auto flex flex-col gap-3" style={{ width: data.width }}>
      {/* 图片区 */}
      <div
        className="relative overflow-hidden rounded-lg border border-border"
        style={{ width: data.width, height: data.height }}
      >
        <img src={data.bg} alt="captcha" width={data.width} height={data.height} draggable={false} />
        <img
          src={data.puzzle}
          alt="piece"
          draggable={false}
          className="pointer-events-none absolute top-0"
          style={{ left: sliderX, width: data.pieceSize, height: data.height }}
        />
        {/* 刷新按钮 */}
        <button
          type="button"
          onClick={() => void load()}
          className="absolute right-1.5 top-1.5 cursor-pointer rounded-md bg-black/40 p-1 text-white/90 backdrop-blur hover:bg-black/60"
          aria-label={t('captcha.refresh', '换一张')}
        >
          <RefreshCw className="size-3.5" />
        </button>
        {status === 'ok' && (
          <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/20">
            <CheckCircle2 className="size-10 text-emerald-500 drop-shadow" />
          </div>
        )}
        {status === 'fail' && (
          <div className="absolute inset-x-0 bottom-0 bg-destructive/80 py-1 text-center text-xs font-medium text-white">
            {t('captcha.failed', '验证失败，请重试')}
          </div>
        )}
      </div>

      {/* 滑轨 + 滑块 */}
      <div
        className={cn(
          'relative h-11 select-none rounded-lg border border-border bg-muted/50',
          status === 'ok' && 'border-emerald-500/50 bg-emerald-500/10',
          status === 'fail' && 'border-destructive/50 bg-destructive/10',
        )}
        style={{ width: data.width }}
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          {status === 'ok' ? t('captcha.passed', '验证通过') : t('captcha.hint', '向右拖动滑块完成拼图')}
        </div>
        <div
          role="slider"
          aria-label="拖动滑块"
          aria-valuenow={Math.round(sliderX)}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => void onPointerUp()}
          className={cn(
            'absolute top-0 flex h-full cursor-grab items-center justify-center rounded-lg border bg-card shadow-sm active:cursor-grabbing',
            status === 'ok' ? 'border-emerald-500 text-emerald-500' : 'border-primary/40 text-primary',
          )}
          style={{ left: sliderX, width: handleWidth, touchAction: 'none' }}
        >
          {status === 'ok' ? '✓' : '→'}
        </div>
      </div>
    </div>
  )
}
