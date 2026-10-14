/**
 * VoiceButton — 按住录音，松手停止，Whisper 转录后直接发送给 LLM
 *
 * 状态机：idle → recording → transcribing → idle
 * onSend(text)         : 转录完成后直接发送，不经过输入框
 * onTranscribingChange : 通知父组件切换"识别中"气泡
 *
 * MIN_DURATION_MS = 2000  最短录音时长
 * MAX_DURATION_MS = 60000 最长录音时长（自动停止）
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Mic, MicOff } from 'lucide-react'
import { chatApi } from '@/api/chat'
import { cn } from '@/utils/helpers'

const MIN_DURATION_MS = 2_000
const MAX_DURATION_MS = 60_000

type Phase = 'idle' | 'recording' | 'transcribing'

export type VoiceButtonProps = {
  /** 转录完成后直接发送文字给 LLM */
  onSend: (text: string) => void
  /** 通知父组件转录阶段开始/结束（用于在聊天区显示"识别中"气泡） */
  onTranscribingChange?: (active: boolean) => void
  onError?: (msg: string) => void
  disabled?: boolean
  className?: string
}

export function VoiceButton({
  onSend,
  onTranscribingChange,
  onError,
  disabled,
  className,
}: VoiceButtonProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [duration, setDuration] = useState(0)
  const [ripple, setRipple] = useState(false)

  const mediaRef    = useRef<MediaRecorder | null>(null)
  const chunksRef   = useRef<Blob[]>([])
  const startTsRef  = useRef<number>(0)
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (timerRef.current)    { clearInterval(timerRef.current);  timerRef.current = null }
    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null }
  }, [])

  const stopAndTranscribe = useCallback(async () => {
    const mr = mediaRef.current
    if (!mr || mr.state === 'inactive') return
    clearTimers()

    const elapsed = Date.now() - startTsRef.current
    if (elapsed < MIN_DURATION_MS) {
      mr.stream.getTracks().forEach((t) => t.stop())
      mediaRef.current = null
      chunksRef.current = []
      setPhase('idle')
      setDuration(0)
      onError?.(`录音时间太短，请至少说 ${MIN_DURATION_MS / 1000} 秒`)
      return
    }

    await new Promise<void>((resolve) => {
      mr.addEventListener('stop', () => resolve(), { once: true })
      mr.stop()
    })

    const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' })
    chunksRef.current = []
    mr.stream.getTracks().forEach((t) => t.stop())
    mediaRef.current = null

    setPhase('transcribing')
    setDuration(0)
    onTranscribingChange?.(true)

    try {
      const res = await chatApi.transcribeAudio(blob, 'recording.webm')
      const text = res?.text?.trim()
      if (text) {
        onSend(text)            // 直接发送，不填入输入框
      } else {
        onError?.('未识别到语音内容，请重试')
      }
    } catch {
      onError?.('语音识别失败，请检查网络或稍后重试')
    } finally {
      setPhase('idle')
      onTranscribingChange?.(false)
    }
  }, [clearTimers, onError, onSend, onTranscribingChange])

  const startRecording = useCallback(async () => {
    if (phase !== 'idle' || disabled) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      chunksRef.current = []
      mr.addEventListener('dataavailable', (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      })
      mr.start(100)
      mediaRef.current = mr
      startTsRef.current = Date.now()
      setPhase('recording')
      setDuration(0)
      setRipple(true)

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTsRef.current) / 1000))
      }, 500)

      maxTimerRef.current = setTimeout(() => stopAndTranscribe(), MAX_DURATION_MS)
    } catch {
      onError?.('无法访问麦克风，请检查浏览器权限')
    }
  }, [phase, disabled, onError, stopAndTranscribe])

  const handlePressStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    startRecording()
  }, [startRecording])

  const handlePressEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (phase === 'recording') stopAndTranscribe()
  }, [phase, stopAndTranscribe])

  useEffect(() => {
    if (!ripple) return
    const t = setTimeout(() => setRipple(false), 600)
    return () => clearTimeout(t)
  }, [ripple])

  useEffect(() => {
    return () => {
      clearTimers()
      mediaRef.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [clearTimers])

  const isRecording    = phase === 'recording'
  const isTranscribing = phase === 'transcribing'
  const isDisabled     = disabled || isTranscribing

  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      {/* 录音脉冲光晕 */}
      {isRecording && (
        <>
          <span className="absolute inset-0 animate-ping rounded-full bg-destructive/30" />
          <span className="absolute inset-[-4px] animate-ping rounded-full bg-destructive/15 [animation-delay:0.3s]" />
        </>
      )}
      {ripple && (
        <span className="pointer-events-none absolute inset-[-6px] animate-ping rounded-full bg-destructive/30" />
      )}

      <button
        type="button"
        aria-label={
          isRecording    ? `录音中 ${duration}s，松手停止` :
          isTranscribing ? '正在识别语音…' :
          '按住说话'
        }
        title={
          isRecording
            ? `录音中 ${duration}s，松手停止（最长 ${MAX_DURATION_MS / 1000}s）`
            : `按住说话（最短 ${MIN_DURATION_MS / 1000}s，最长 ${MAX_DURATION_MS / 1000}s）`
        }
        disabled={isDisabled}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={phase === 'recording' ? handlePressEnd : undefined}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        className={cn(
          'relative size-10 shrink-0 rounded-2xl flex items-center justify-center',
          'transition-all duration-200 select-none touch-none cursor-pointer',
          isRecording
            ? 'bg-destructive text-white shadow-lg scale-110'
            : isTranscribing
              ? 'bg-muted/60 text-primary cursor-wait'
              : isDisabled
                ? 'bg-muted/40 text-muted-foreground/70 cursor-not-allowed'
                : 'bg-muted/60 text-foreground/80 hover:bg-muted hover:text-primary hover:shadow-md',
        )}
      >
        {isTranscribing ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : isRecording ? (
          <MicOff className="size-4" aria-hidden />
        ) : (
          <Mic className="size-4" aria-hidden />
        )}
      </button>

      {/* 录音时长提示 */}
      {isRecording && (
        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-destructive/90 px-2 py-0.5 text-[11px] font-medium text-white shadow-lg">
          {duration}s / {MAX_DURATION_MS / 1000}s
        </span>
      )}
    </div>
  )
}
