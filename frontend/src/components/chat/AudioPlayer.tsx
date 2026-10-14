/**
 * AudioPlayer — 助手消息气泡内的朗读控件
 *
 * Props:
 *   messageId   : 消息 ID，用于调用 TTS 生成接口
 *   ttsUrl      : 已生成的音频 URL（为 null 时点击播放按钮触发生成）
 *   autoPlay    : true → ttsUrl 准备好后自动播放
 *   onTtsReady  : TTS 生成完成回调，传回 url 供父组件持久化
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Pause, Play, RotateCcw, Volume2 } from 'lucide-react'
import { chatApi } from '@/api/chat'
import { cn } from '@/utils/helpers'

type Phase = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export type AudioPlayerProps = {
  messageId: string
  ttsUrl: string | null
  autoPlay?: boolean
  onTtsReady?: (url: string) => void
  className?: string
}

export function AudioPlayer({ messageId, ttsUrl, autoPlay, onTtsReady, className }: AudioPlayerProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)   // 0-1
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(ttsUrl)

  // 同步外部传入的 url 变化
  useEffect(() => { setResolvedUrl(ttsUrl) }, [ttsUrl])

  // 构建 / 获取 audio element
  const getAudio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      const el = new Audio()
      el.preload = 'metadata'
      el.addEventListener('timeupdate', () => {
        setCurrentTime(el.currentTime)
        setProgress(el.duration > 0 ? el.currentTime / el.duration : 0)
      })
      el.addEventListener('loadedmetadata', () => setDuration(el.duration))
      el.addEventListener('ended', () => { setPhase('idle'); setProgress(0); setCurrentTime(0) })
      el.addEventListener('error', () => setPhase('error'))
      audioRef.current = el
    }
    return audioRef.current
  }, [])

  useEffect(() => {
    return () => { audioRef.current?.pause() }
  }, [])

  // 当 resolvedUrl + autoPlay 同时就绪时自动播放
  useEffect(() => {
    if (!autoPlay || !resolvedUrl) return
    playUrl(resolvedUrl)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, resolvedUrl])

  const playUrl = useCallback((url: string) => {
    const el = getAudio()
    el.src = url
    el.currentTime = 0
    setPhase('playing')
    el.play().catch(() => setPhase('error'))
  }, [getAudio])

  const handlePlay = useCallback(async () => {
    if (phase === 'paused' && audioRef.current) {
      audioRef.current.play()
      setPhase('playing')
      return
    }
    if (resolvedUrl) {
      playUrl(resolvedUrl)
      return
    }
    // 需要先生成 TTS
    setPhase('loading')
    try {
      const res = await chatApi.generateTts(messageId)
      const url = res?.tts_audio_url
      if (!url) throw new Error('no url')
      setResolvedUrl(url)
      onTtsReady?.(url)
      playUrl(url)
    } catch {
      setPhase('error')
    }
  }, [phase, resolvedUrl, messageId, onTtsReady, playUrl])

  const handlePause = useCallback(() => {
    audioRef.current?.pause()
    setPhase('paused')
  }, [])

  const handleReplay = useCallback(() => {
    if (resolvedUrl) playUrl(resolvedUrl)
  }, [resolvedUrl, playUrl])

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const isPlaying = phase === 'playing'
  const isLoading = phase === 'loading'

  return (
    <div className={cn('flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border/60', className)}>
      <Volume2 className="size-3.5 shrink-0 text-primary/60" aria-hidden />

      {/* 播放 / 暂停 */}
      <button
        type="button"
        disabled={isLoading}
        onClick={isPlaying ? handlePause : () => void handlePlay()}
        aria-label={isPlaying ? '暂停朗读' : '播放朗读'}
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full transition-all duration-200',
          isLoading
            ? 'cursor-wait bg-primary/10 text-primary/60'
            : 'bg-primary/15 text-primary hover:bg-primary/25 cursor-pointer',
        )}
      >
        {isLoading
          ? <Loader2 className="size-3 animate-spin" aria-hidden />
          : isPlaying
            ? <Pause className="size-3" aria-hidden />
            : <Play className="size-3 translate-x-[1px]" aria-hidden />
        }
      </button>

      {/* 进度条 */}
      <div className="relative flex-1 h-1 rounded-full bg-muted/80 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary/60 transition-all duration-100"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* 时间 */}
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
        {isPlaying || phase === 'paused'
          ? `${fmtTime(currentTime)} / ${fmtTime(duration)}`
          : duration > 0
            ? fmtTime(duration)
            : resolvedUrl ? '…' : '朗读'
        }
      </span>

      {/* 重播 */}
      {(resolvedUrl && (phase === 'idle' || phase === 'paused')) && (
        <button
          type="button"
          onClick={handleReplay}
          aria-label="重新播放"
          title="重新播放"
          className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:text-primary/80 cursor-pointer transition-colors"
        >
          <RotateCcw className="size-3" aria-hidden />
        </button>
      )}

      {phase === 'error' && (
        <span className="shrink-0 text-[10px] text-destructive">生成失败</span>
      )}
    </div>
  )
}
