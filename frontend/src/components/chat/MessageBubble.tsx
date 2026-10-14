import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { parseApiDate } from '@/utils/format'
import { ChevronDown, ChevronRight, Copy, Check, ExternalLink, FileText, Loader2, Image as ImageIcon, Sparkles, Package, Building, UserCircle, Briefcase } from 'lucide-react'
import type { ChatMessage, ContextChunk } from '@/types/chat'
import type { ReferenceChip } from '@/pages/chat/composerUtils'

/** 静态标签卡（品牌/产品/公司/客户/案例）的图标 */
const REF_CHIP_ICON: Record<string, typeof Package> = {
  brand: Sparkles,
  product: Package,
  company: Building,
  customer: UserCircle,
  case: Briefcase,
}
import { AudioPlayer } from '@/components/chat/AudioPlayer'
import { GenerationCard } from '@/components/chat/GenerationCard'
import ExportCard from '@/components/chat/ExportCard'
import UploadCard from '@/components/chat/UploadCard'
import { Modal } from '@/components/common/Modal'
import { DocumentPreviewModal } from '@/components/common/DocumentPreview'
import { MediaPreview } from '@/components/common/MediaPreview'
import { toast } from '@/components/common/Toast'
import { useChatStore } from '@/stores/chatStore'
import { documentsApi } from '@/api/documents'
import { cn } from '@/utils/helpers'
import MarkDown2 from '@/components/markdown2'
import { useTheme } from '@/components/theme/ThemeProvider'

export type MessageBubbleProps = {
  message: ChatMessage
  isStreaming?: boolean
  streamContent?: string
  scrollContainerRef?: React.RefObject<HTMLElement | null>
  /** 是否自动播放朗读（autoRead 模式下由 ChatPage 传入） */
  autoPlay?: boolean
}


function ChunkDetailModal({
  chunk,
  userQuery,
  onClose,
}: {
  chunk: ContextChunk | null
  userQuery?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null)
  const [docFileName, setDocFileName] = useState('document.txt')
  const [docFileType, setDocFileType] = useState<string | undefined>(undefined)
  const [docLoading, setDocLoading] = useState(false)
  const [docMissing, setDocMissing] = useState(false)
  const [docPreviewOpen, setDocPreviewOpen] = useState(false)

  // 切换 chunk 时重置文档预览状态
  useEffect(() => {
    setDocPreviewUrl(null)
    setDocMissing(false)
  }, [chunk?.chunk_id])

  if (!chunk) return null

  const handleOpenDocPreview = async () => {
    if (docPreviewUrl) { setDocPreviewOpen(true); return }
    if (!chunk.document_id) { setDocMissing(true); return }
    setDocLoading(true)
    try {
      const res = await documentsApi.download(chunk.document_id)
      // 优先用 chunk.file_type（最可靠），回退到从 URL 提取扩展名
      setDocFileType(chunk.file_type || undefined)
      const urlFileName = res.url.split('/').pop()?.split('?')[0] || ''
      setDocFileName(chunk.file_name || urlFileName || chunk.document_title || 'document')
      setDocPreviewUrl(res.url)
      setDocPreviewOpen(true)
    } catch {
      setDocMissing(true)
    } finally {
      setDocLoading(false)
    }
  }

  return (
    <>
      {/* 当原文档预览打开时，暂时关闭片段详情 Modal —— 否则 Radix Dialog 会给
          body 加 pointer-events:none，使原文档预览 portal 无法滚动/点击。 */}
      <Modal open={!!chunk && !docPreviewOpen} onClose={onClose} title={t('chat.chunkDetail')} size="lg">
        <div className="space-y-4">
          {/* 来源文档行 */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 p-4">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{t('chat.sourceDocument')}</p>
              <p className="text-sm font-semibold text-foreground">{chunk.document_title}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleOpenDocPreview()}
              disabled={docLoading}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 disabled:opacity-60 transition-app"
            >
              {docLoading
                ? <Loader2 className="size-3.5 animate-spin" />
                : <FileText className="size-3.5" />}
              {docLoading ? '加载中…' : '预览原文档'}
            </button>
          </div>

          {/* 文档不存在提示 */}
          {docMissing && (
            <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
              原文档不存在或已被删除
            </p>
          )}

          {/* 分数 + chunk ID */}
          <div className="flex flex-wrap gap-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary/60">{t('chat.matchScore')}</p>
              <p className="text-base font-bold text-primary">{chunk.score.toFixed(4)}</p>
            </div>
            <div className="min-w-0 flex-1 rounded-xl border border-border/60 bg-card/60 px-4 py-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{t('chat.chunkId')}</p>
              <p className="truncate font-[family-name:var(--font-mono)] text-xs text-muted-foreground">{chunk.chunk_id}</p>
            </div>
          </div>

          {/* 本轮用户问题 */}
          {userQuery && (
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-2.5">
              <span className="shrink-0 text-xs font-semibold text-muted-foreground/70">用户问题：</span>
              <span
                className="min-w-0 truncate text-xs text-foreground/80 cursor-default"
                title={userQuery}
              >
                {userQuery}
              </span>
            </div>
          )}

          {/* 完整内容：Markdown 渲染 */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{t('chat.fullContent')}</p>
            {chunk.content ? (
              <div className="max-h-96 overflow-y-auto rounded-xl border border-border/60 bg-background/60 p-4 text-sm leading-relaxed">
                <MarkDown2 content={chunk.content} theme={resolvedTheme} />
              </div>
            ) : (
              <p className="rounded-xl border border-border/60 bg-card/60 p-4 text-sm italic text-muted-foreground">{t('chat.noContent')}</p>
            )}
          </div>
        </div>
      </Modal>

      {/* 原文档预览弹窗（层叠在 ChunkDetailModal 之上） */}
      {docPreviewOpen && docPreviewUrl && (
        <DocumentPreviewModal
          url={docPreviewUrl}
          fileName={docFileName}
          fileType={docFileType}
          title={chunk.document_title}
          onClose={() => setDocPreviewOpen(false)}
        />
      )}
    </>
  )
}


/** 用户消息气泡内的「挂载参考素材」卡片：文档可点开预览全文，图片点开全屏灯箱。 */
function UserReferenceCards({ refs }: { refs: ReferenceChip[] }) {
  const [docPreview, setDocPreview] = useState<
    { url: string; fileName: string; fileType?: string; title: string } | null
  >(null)
  const [imgPreview, setImgPreview] = useState<{ url: string; alt?: string } | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const openDoc = useCallback(async (r: ReferenceChip) => {
    setLoadingId(r.id)
    try {
      const res = await documentsApi.download(r.id)
      const urlFileName = res.url.split('/').pop()?.split('?')[0] || ''
      setDocPreview({
        url: res.url,
        fileName: r.title || urlFileName || 'document',
        // 传 fileType 而非依赖文件名扩展名，否则会判不出格式提示「暂不支持」
        fileType: r.fileType,
        title: r.title || '文档',
      })
    } catch {
      toast.error('原文档不存在或已被删除')
    } finally {
      setLoadingId(null)
    }
  }, [])

  if (!refs.length) return null

  return (
    <>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {refs.map((r) => {
          const key = `${r.kind}:${r.id}`
          if (r.kind === 'document') {
            return (
              <button
                key={key}
                type="button"
                onClick={() => void openDoc(r)}
                disabled={loadingId === r.id}
                className="inline-flex max-w-[14rem] cursor-pointer items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1 text-xs font-medium text-primary transition-app hover:bg-primary/10 disabled:opacity-60"
                title={r.title}
              >
                {loadingId === r.id
                  ? <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  : <FileText className="size-3.5 shrink-0" />}
                <span className="truncate">{r.title || '文档'}</span>
              </button>
            )
          }
          if (r.kind === 'image') {
            const preview = r.fullUrl || r.url
            return (
              <button
                key={key}
                type="button"
                onClick={() => preview && setImgPreview({ url: preview, alt: r.title })}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/60 bg-card/70 py-1 pl-1 pr-2 text-xs font-medium text-foreground/80 transition-app hover:border-primary/30 hover:text-primary"
                title={r.title}
              >
                {r.url
                  ? <img src={r.url} alt={r.title || ''} className="size-5 shrink-0 rounded object-cover" />
                  : <ImageIcon className="size-3.5 shrink-0" />}
                <span className="max-w-[10rem] truncate">{r.title || '图片'}</span>
              </button>
            )
          }
          // brand / product / company / customer / case：静态标签卡
          const label =
            r.kind === 'product' ? (r.brandName ? `${r.brandName} · ${r.name}` : r.name)
            : r.kind === 'case' ? r.title
            : r.name
          const Icon = REF_CHIP_ICON[r.kind] ?? Package
          return (
            <span
              key={key}
              className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-lg border border-border/60 bg-card/70 px-2 py-1 text-xs font-medium text-foreground/80"
              title={label}
            >
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{label}</span>
            </span>
          )
        })}
      </div>
      {docPreview && (
        <DocumentPreviewModal
          url={docPreview.url}
          fileName={docPreview.fileName}
          fileType={docPreview.fileType}
          title={docPreview.title}
          onClose={() => setDocPreview(null)}
        />
      )}
      {imgPreview && (
        <MediaPreview
          url={imgPreview.url}
          type="image"
          alt={imgPreview.alt}
          onClose={() => setImgPreview(null)}
        />
      )}
    </>
  )
}


export function MessageBubble({ message, isStreaming, streamContent = '', scrollContainerRef, autoPlay }: MessageBubbleProps) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const [refsOpen, setRefsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selectedChunk, setSelectedChunk] = useState<ContextChunk | null>(null)
  const updateMessageTtsUrl = useChatStore((s) => s.updateMessageTtsUrl)

  // 找本条 assistant 消息对应的上一条用户问题（用于知识片段关键词高亮）
  const userQuery = useChatStore((s) => {
    if (message.role !== 'assistant') return undefined
    const msgs = s.messages
    const idx = msgs.findIndex((m) => m.id === message.id)
    if (idx <= 0) return s.streamContent || undefined
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') return msgs[i].content
    }
    return undefined
  })

  const displayContent = isStreaming && message.role === 'assistant' ? streamContent : message.content

  const copyText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayContent)
      setCopied(true)
      toast.success(t('chat.copied'))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('common.failed'))
    }
  }, [displayContent, t])

  const ts = message.created_at ? format(parseApiDate(message.created_at), 'PPp') : ''

  if (message.role === 'system') {
    return (
      <div className="flex justify-center px-2 py-2">
        <p className="max-w-xl rounded-full bg-muted/60 px-4 py-1.5 text-center text-xs text-muted-foreground">
          {message.content}
        </p>
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div className={cn('group relative flex gap-3 px-3 py-2.5 md:px-4', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'max-w-[min(100%,44rem)] px-5 py-4 transition-app',
          isUser
            ? 'rounded-3xl rounded-tr-sm bg-primary/10 border border-primary/20 text-foreground shadow-sm'
            : 'rounded-3xl rounded-tl-sm bg-card border border-border text-foreground shadow-xs',
        )}
      >
        {isUser ? (
          <>
            {Array.isArray(message.attachments) && message.attachments.length > 0 && (
              <UserReferenceCards refs={message.attachments as ReferenceChip[]} />
            )}
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{displayContent}</p>
          </>
        ) : (
          <div className={cn('text-sm', isStreaming && !displayContent && 'min-h-[1.25rem]')}>
            {displayContent ? (
              <MarkDown2
                content={displayContent}
                loading={isStreaming}
                autoScroll={isStreaming}
                scrollContainerRef={scrollContainerRef}
                theme={resolvedTheme}
              />
            ) : isStreaming ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground" aria-live="polite">
                <span className="inline-block size-1.5 animate-bounce rounded-full bg-primary [animation-duration:1s]" />
                <span className="inline-block size-1.5 animate-bounce rounded-full bg-primary [animation-duration:1s] [animation-delay:150ms]" />
                <span className="inline-block size-1.5 animate-bounce rounded-full bg-primary [animation-duration:1s] [animation-delay:300ms]" />
              </span>
            ) : null}
          </div>
        )}

        {/* 朗读播放器：仅在非流式且 autoRead 开启（或已有 tts_url）时显示 */}
        {!isUser && !isStreaming && (autoPlay || message.tts_audio_url) && (
          <AudioPlayer
            messageId={message.id}
            ttsUrl={message.tts_audio_url ?? null}
            autoPlay={autoPlay}
            onTtsReady={(url) => updateMessageTtsUrl(message.id, url)}
          />
        )}

        {!isUser && message.context_chunks && message.context_chunks.length > 0 && (
          <div className="mt-3 border-t border-border/60 pt-2">
            <button
              type="button"
              onClick={() => setRefsOpen(v => !v)}
              className="flex w-full cursor-pointer items-center gap-1 text-left text-xs font-medium text-muted-foreground/70 hover:text-muted-foreground transition-app"
            >
              {refsOpen ? <ChevronDown className="size-3.5 shrink-0" aria-hidden /> : <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
              {t('chat.references')} ({message.context_chunks.length})
            </button>
            {refsOpen && (
              <ul className="mt-2 space-y-2">
                {message.context_chunks.map((ch) => (
                  <li key={ch.chunk_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedChunk(ch)}
                      className="group/ref w-full cursor-pointer rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-left text-xs text-muted-foreground transition-app hover:bg-primary/5 hover:border-primary/20"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground/80 group-hover/ref:text-primary">{ch.document_title}</span>
                        <span className="badge bg-primary/10 text-primary border-primary/20">{ch.score.toFixed(2)}</span>
                        <ExternalLink className="ml-auto size-3 shrink-0 text-muted-foreground/70 opacity-0 transition-opacity group-hover/ref:opacity-100" aria-hidden />
                      </div>
                      {ch.content && <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground/70">{ch.content}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 内容生成卡片：文章/图片/视频 */}
        {!isUser && !isStreaming && message.generation_results && message.generation_results.length > 0 && (
          <div className="space-y-0">
            {message.generation_results.map((r) => (
              <GenerationCard key={r.generation_id} result={r} />
            ))}
          </div>
        )}


        {/* 导出下载卡片 */}
        {!isUser && !isStreaming && message.export_results && message.export_results.length > 0 && (
          <div className="mt-1 space-y-0">
            {message.export_results.map((r) => (
              <ExportCard key={`${r.generation_id}-${r.format}`} result={r} />
            ))}
          </div>
        )}

        {/* 文件上传卡片 */}
        {!isUser && !isStreaming && message.upload_results && message.upload_results.length > 0 && (
          <div className="mt-1 space-y-0">
            {message.upload_results.map((r) => (
              <UploadCard key={r.file_id} result={r} />
            ))}
          </div>
        )}
      </div>

      <div className={cn('pointer-events-none flex flex-col items-center gap-1 self-end opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100', isUser ? 'items-start' : 'items-end')}>
        <button
          type="button"
          onClick={() => void copyText()}
          className="pointer-events-auto h-7 cursor-pointer px-2 inline-flex items-center gap-1 rounded-lg text-xs text-muted-foreground/70 bg-muted/40 border border-border/60 hover:bg-muted/80 hover:text-muted-foreground transition-app"
        >
          {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
          {copied ? t('chat.copied') : t('chat.copy')}
        </button>
        {ts && <time dateTime={message.created_at} className="text-[10px] text-muted-foreground/70">{ts}</time>}
      </div>

      <ChunkDetailModal chunk={selectedChunk} userQuery={userQuery} onClose={() => setSelectedChunk(null)} />
    </div>
  )
}
