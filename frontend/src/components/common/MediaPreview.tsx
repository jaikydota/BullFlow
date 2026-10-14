import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  Download,
  MessageSquare,
  Mic,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { toast } from '@/components/common/Toast'
import { cn } from '@/utils/helpers'

function extFromMime(mime: string): string | null {
  if (mime.includes('jpeg') || mime === 'image/jpg') return 'jpg'
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('octet-stream')) return null
  const s = mime.split('/')[1]
  return s ? s.replace(/\+xml$/, '').slice(0, 8) : null
}

/** 尽量生成带合法文件名的下载名 */
function downloadFileName(label: string | undefined, url: string, blobType?: string): string {
  let base = (label && label.trim()) ? label.trim() : 'download'
  base = base.replace(/[/\\?%*:|"<>]/g, '_')
  if (/\.\w{2,8}$/i.test(base)) return base
  try {
    const path = new URL(url, window.location.href).pathname
    const file = path.split('/').pop() ?? ''
    const m = file.match(/(\.\w+)$/)
    if (m) return `${base}${m[1]}`
  } catch { /* ignore */ }
  const ext = blobType ? extFromMime(blobType) : null
  return ext ? `${base}.${ext}` : base
}

export type MediaItem = {
  url: string
  type: 'image' | 'video' | 'audio'
  label?: string
  /** 视频封面图 url（来自 cover_path） */
  coverUrl?: string
  prompt?: string
  isAiPrompt?: boolean
}

export type MediaPreviewProps = {
  url?: string
  type?: 'image' | 'video' | 'audio'
  alt?: string
  /** 单 URL 模式下的视频封面（与 items[].coverUrl 一致） */
  coverUrl?: string
  /** 单 URL 模式下的提示词（与 items[].prompt 一致） */
  prompt?: string
  isAiPrompt?: boolean
  items?: MediaItem[]
  startIndex?: number
  onClose: () => void
  onDelete?: (index: number) => void
}

function ToolBtn({
  onClick,
  title,
  className,
  children,
}: {
  onClick: () => void
  title?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'cursor-pointer p-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.18] text-white backdrop-blur-sm transition-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function MediaPreview({
  url,
  type = 'image',
  alt,
  coverUrl,
  prompt,
  isAiPrompt,
  items,
  startIndex = 0,
  onClose,
  onDelete,
}: MediaPreviewProps) {
  const mediaItems: MediaItem[] =
    items ??
    (url
      ? [
          {
            url,
            type,
            label: alt,
            ...(coverUrl ? { coverUrl } : {}),
            ...(prompt ? { prompt } : {}),
            ...(isAiPrompt !== undefined ? { isAiPrompt } : {}),
          },
        ]
      : [])
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(mediaItems.length - 1, 0)))
  const [dir, setDir] = useState<1 | -1>(1)
  const [scale, setScale] = useState(1)
  const [promptOpen, setPromptOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const current = mediaItems[index]
  const isMulti = mediaItems.length > 1

  const goPrev = useCallback(() => {
    setDir(-1)
    setIndex(i => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setDir(1)
    setIndex(i => Math.min(mediaItems.length - 1, i + 1))
  }, [mediaItems.length])

  useEffect(() => {
    setScale(1)
    setCopied(false)
  }, [index])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && isMulti) goPrev()
      if (e.key === 'ArrowRight' && isMulti) goNext()
    }
    document.addEventListener('keydown', handler)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = originalOverflow
    }
  }, [isMulti, goNext, onClose, goPrev])

  const handleDownload = async () => {
    const url = current?.url
    if (!url || downloading) return
    const label = current?.label
    setDownloading(true)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const name = downloadFileName(label, url, blob.type)
      const obj = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = obj
      a.download = name
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(obj)
    } catch {
      toast.error('下载失败，请检查网络或稍后重试')
    } finally {
      setDownloading(false)
    }
  }

  const handleCopy = async () => {
    if (!current?.prompt) return
    await navigator.clipboard.writeText(current.prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!current || typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="media-preview"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        {/* 顶部工具栏 */}
        <div className="flex items-center gap-3 px-4 py-3 shrink-0">
          {/* 左上角：文件名 + 序号 */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {current.label && (
              <span className="truncate max-w-[min(40vw,24rem)] text-sm font-medium text-white/90">
                {current.label}
              </span>
            )}
            {isMulti && (
              <span className="shrink-0 text-xs text-white/40 tabular-nums px-2 py-0.5 bg-white/[0.08] rounded-lg">
                {index + 1} / {mediaItems.length}
              </span>
            )}
          </div>

          {/* 右上角：工具按钮 */}
          <div className="flex shrink-0 items-center gap-1.5">
            {current.type === 'image' && (
              <>
                <ToolBtn onClick={() => setScale(s => Math.max(0.5, s - 0.25))} title="缩小">
                  <ZoomOut className="size-5" />
                </ToolBtn>
                <ToolBtn onClick={() => setScale(s => Math.min(3, s + 0.25))} title="放大">
                  <ZoomIn className="size-5" />
                </ToolBtn>
              </>
            )}
            <ToolBtn onClick={() => void handleDownload()} title={downloading ? '下载中…' : '下载'} className={downloading ? 'opacity-60 pointer-events-none' : ''}>
              <Download className="size-5" />
            </ToolBtn>
            {current.prompt && (
              <ToolBtn
                onClick={() => setPromptOpen(v => !v)}
                title="提示词"
                className={promptOpen ? 'bg-neon-cyan/20 text-neon-cyan' : ''}
              >
                <MessageSquare className="size-5" />
              </ToolBtn>
            )}
            {onDelete && (
              <ToolBtn
                onClick={() => { onDelete(index); onClose() }}
                title="删除"
                className="hover:bg-neon-red/20 hover:text-neon-red"
              >
                <Trash2 className="size-5" />
              </ToolBtn>
            )}
            <ToolBtn onClick={onClose} title="关闭"><X className="size-5" /></ToolBtn>
          </div>
        </div>

        {/* 主区域 */}
        <div className="flex flex-1 min-h-0 relative overflow-hidden">
          {/* 提示词侧栏 */}
          <AnimatePresence>
            {promptOpen && current.prompt && (
              <motion.div
                key="prompt-panel"
                initial={{ x: -460, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -460, opacity: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="absolute left-4 top-4 bottom-4 z-10 w-72 flex flex-col rounded-2xl bg-bg-surface/95 backdrop-blur-md border border-white/[0.10] overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06] shrink-0">
                  <span
                    className={cn(
                      'badge text-[9px]',
                      current.isAiPrompt
                        ? 'bg-neon-amber/15 text-neon-amber border-neon-amber/40'
                        : 'bg-neon-cyan/15 text-neon-cyan border-neon-cyan/40',
                    )}
                  >
                    {current.isAiPrompt ? 'AI 生成' : '自定义'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={cn(
                      'badge transition-app cursor-pointer',
                      copied
                        ? 'bg-neon-green/15 text-neon-green border-neon-green/30'
                        : 'bg-white/[0.06] text-text-muted border-white/[0.1] hover:text-text-primary',
                    )}
                  >
                    {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <p className="text-sm text-text-secondary leading-relaxed font-[family-name:var(--font-mono)] whitespace-pre-wrap break-words">
                    {current.prompt}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 左切换箭头 */}
          {isMulti && (
            <button
              type="button"
              onClick={goPrev}
              className={cn(
                'absolute left-4 top-1/2 -translate-y-1/2 z-10 cursor-pointer p-2.5 rounded-full bg-white/[0.08] hover:bg-white/[0.20] backdrop-blur-sm text-white transition-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
                index === 0 && 'opacity-20 pointer-events-none',
              )}
            >
              <ChevronLeft className="size-7" />
            </button>
          )}

          {/* 媒体内容（方向感知的滑动切入/切出） */}
          <div className="flex-1 flex items-center justify-center px-16 overflow-hidden">
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.div
                key={`${index}-${current.url}`}
                custom={dir}
                variants={{
                  initial: (direction: number) => ({ opacity: 0, x: direction * 60 }),
                  animate: { opacity: 1, x: 0 },
                  exit: (direction: number) => ({ opacity: 0, x: direction * -60 }),
                }}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.14, ease: [0.4, 0, 0.2, 1] }}
                className="relative z-10 max-w-[95vw] sm:max-w-[88vw] max-h-[90vh] flex flex-col items-center justify-center w-full min-h-0"
              >
                {current.type === 'video' ? (
                  <video
                    src={current.url}
                    controls
                    autoPlay
                    className="max-h-[82vh] rounded-2xl bg-black shadow-2xl"
                    style={{ maxWidth: '100%' }}
                  />
                ) : current.type === 'audio' ? (
                  <div className="flex flex-col items-center justify-center gap-6">
                    <div className="flex size-32 items-center justify-center rounded-full bg-gradient-to-br from-neon-purple/30 to-neon-pink/30 border border-neon-purple/30 shadow-2xl">
                      <Mic className="size-16 text-neon-purple" />
                    </div>
                    <p className="max-w-sm text-center text-sm text-white/60 px-4">{current.label}</p>
                    <audio
                      src={current.url}
                      controls
                      autoPlay
                      className="w-80 rounded-xl"
                    />
                  </div>
                ) : (
                  <motion.img
                    src={current.url}
                    alt={current.label ?? ''}
                    animate={{ scale }}
                    transition={{ duration: 0.2 }}
                    className="max-h-[82vh] object-contain rounded-2xl shadow-2xl select-none"
                    style={{ maxWidth: '100%' }}
                    draggable={false}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 右切换箭头 */}
          {isMulti && (
            <button
              type="button"
              onClick={goNext}
              className={cn(
                'absolute right-4 top-1/2 -translate-y-1/2 z-10 cursor-pointer p-2.5 rounded-full bg-white/[0.08] hover:bg-white/[0.20] backdrop-blur-sm text-white transition-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
                index === mediaItems.length - 1 && 'opacity-20 pointer-events-none',
              )}
            >
              <ChevronRight className="size-7" />
            </button>
          )}
        </div>

        {/* 底部缩略图条（≤20 项时显示）*/}
        {isMulti && mediaItems.length <= 20 && (
          <div className="shrink-0 flex justify-center p-4">
            <div className="flex gap-2 px-3 py-2 rounded-xl bg-black/50 backdrop-blur-xl border border-white/[0.06]">
              {mediaItems.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setDir(i > index ? 1 : -1)
                    setIndex(i)
                  }}
                  className={cn(
                    'size-14 rounded-lg overflow-hidden transition-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan cursor-pointer',
                    i === index
                      ? 'border-2 border-neon-cyan shadow-[0_0_8px_rgba(0,212,255,0.3)] opacity-100'
                      : 'border-2 border-transparent opacity-50 hover:opacity-80',
                  )}
                >
                  {item.type === 'audio' ? (
                    /* 音频：Mic 图标占位 */
                    <div className="size-full bg-gradient-to-br from-neon-purple/20 to-neon-pink/20 flex items-center justify-center">
                      <Mic className="size-5 text-neon-purple/80" />
                    </div>
                  ) : item.type === 'video' ? (
                    /* 视频：有 coverUrl 则显示封面，否则显示播放符 */
                    item.coverUrl ? (
                      <img src={item.coverUrl} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <div className="size-full bg-bg-card flex items-center justify-center">
                        <span className="text-white/50 text-sm">▶</span>
                      </div>
                    )
                  ) : (
                    <img src={item.url} alt="" className="size-full object-cover" loading="lazy" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
