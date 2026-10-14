import { useEffect, useRef, useState } from 'react'
import { ArrowRight, FileText, Image, Loader2, Video, AlertCircle, Eye } from 'lucide-react'
import type { GenerationResult } from '@/types/chat'
import { generationApi } from '@/api/generation'
import { DocumentPreviewModal } from '@/components/common/DocumentPreview'
import { MediaPreview } from '@/components/common/MediaPreview'
import { cn } from '@/utils/helpers'

/** 轮询间隔（ms），用于视频等异步任务 */
const POLL_INTERVAL_MS = 4000

const TYPE_CONFIG = {
  article: { icon: FileText, label: '文章', color: 'text-primary' },
  image:   { icon: Image,    label: '图片', color: 'text-purple-400' },
  video:   { icon: Video,    label: '视频', color: 'text-amber-400' },
} as const

const STATUS_BADGE: Record<GenerationResult['status'], { label: string; className: string }> = {
  pending:    { label: '等待中',   className: 'bg-muted/60 text-muted-foreground' },
  generating: { label: '生成中',   className: 'bg-primary/10 text-primary' },
  completed:  { label: '已完成',   className: 'bg-emerald-500/10 text-emerald-400' },
  failed:     { label: '生成失败', className: 'bg-destructive/10 text-destructive' },
}

export function GenerationCard({
  result: initialResult,
}: {
  result: GenerationResult
}) {
  const [result, setResult] = useState<GenerationResult>(initialResult)
  const [previewOpen, setPreviewOpen] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 轮询：对 pending/generating 状态每隔一段时间查询进度
  useEffect(() => {
    if (result.status !== 'pending' && result.status !== 'generating') return

    pollRef.current = setInterval(async () => {
      try {
        const detail = await generationApi.get(result.generation_id)
        if (detail.status !== result.status) {
          setResult((prev) => ({
            ...prev,
            status: detail.status as GenerationResult['status'],
            preview_info:
              detail.status === 'completed'
                ? {
                    file_url: detail.file_path ?? undefined,
                    thumbnail_url: detail.thumbnail_path ?? undefined,
                    content: detail.content?.slice(0, 300) ?? undefined,
                    media_urls: detail.media_urls ?? undefined,
                    layout: detail.layout ?? undefined,
                  }
                : prev.preview_info,
          }))
        }
        if (detail.status === 'completed' || detail.status === 'failed') {
          clearInterval(pollRef.current!)
          pollRef.current = null
        }
      } catch {
        // 静默忽略，下次再试
      }
    }, POLL_INTERVAL_MS)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [result.generation_id, result.status])

  // 父组件传入新状态时同步（如历史消息重新加载）—— 故意的 prop→state 同步
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(initialResult)
  }, [initialResult.status, initialResult.generation_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const typeCfg = TYPE_CONFIG[result.type] ?? TYPE_CONFIG.article
  const TypeIcon = typeCfg.icon
  const statusBadge = STATUS_BADGE[result.status]
  const isReady = result.status === 'completed'
  const isBusy = result.status === 'pending' || result.status === 'generating'

  return (
    <>
      <div className="mt-3 rounded-xl border border-border bg-background/60 p-3">
        <div className="flex items-start gap-3">
          {/* 类型图标 */}
          <span className={cn('mt-0.5 shrink-0', typeCfg.color)}>
            {isBusy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : result.status === 'failed' ? (
              <AlertCircle className="size-4 text-destructive" aria-hidden />
            ) : (
              <TypeIcon className="size-4" aria-hidden />
            )}
          </span>

          {/* 标题 + 状态标签 */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
                {typeCfg.label}已生成
              </span>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', statusBadge.className)}>
                {statusBadge.label}
              </span>
            </div>
            {result.title && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{result.title}</p>
            )}
            {isBusy && (
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                {result.type === 'video' ? '视频正在后台生成，请稍候…' : '正在生成内容…'}
              </p>
            )}
          </div>

          {/* 操作按钮区域 */}
          <div className="flex shrink-0 items-center gap-1.5">
            {isReady && (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15 transition-app"
              >
                <Eye className="size-3" aria-hidden />
                预览
              </button>
            )}
            <a
              href={`/generation/library/${result.generation_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground/80 hover:bg-muted/80 hover:text-foreground transition-app"
            >
              查看详情
              <ArrowRight className="size-3" aria-hidden />
            </a>
          </div>
        </div>

        {/* 图片缩略图内联预览：多图网格 / 单图 */}
        {isReady && result.type === 'image' && (result.preview_info?.media_urls?.length ?? 0) > 1 ? (
          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {result.preview_info!.media_urls!.slice(0, 6).map((u, i) => (
              <button
                key={u}
                type="button"
                className="aspect-square cursor-pointer overflow-hidden rounded-lg"
                onClick={() => setPreviewOpen(true)}
              >
                <img
                  src={u}
                  alt={`${result.title ?? '生成图片'} ${i + 1}`}
                  className="h-full w-full object-cover transition-transform hover:scale-[1.02]"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        ) : isReady && result.type === 'image' && result.preview_info?.thumbnail_url ? (
          <button
            type="button"
            className="mt-2.5 w-full cursor-pointer overflow-hidden rounded-lg"
            onClick={() => setPreviewOpen(true)}
          >
            <img
              src={result.preview_info.thumbnail_url}
              alt={result.title ?? '生成图片'}
              className="h-24 w-full object-cover transition-transform hover:scale-[1.02]"
            />
          </button>
        ) : null}

        {/* 文章摘要内联预览 */}
        {isReady && result.type === 'article' && result.preview_info?.content && (
          <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground/70">
            {result.preview_info.content}
          </p>
        )}
      </div>

      {/* 预览弹窗 */}
      {previewOpen && isReady && (
        <GenerationPreviewModal result={result} onClose={() => setPreviewOpen(false)} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// 预览弹窗
// ---------------------------------------------------------------------------

function GenerationPreviewModal({
  result,
  onClose,
}: {
  result: GenerationResult
  onClose: () => void
}) {
  if (result.type === 'image' && (result.preview_info?.media_urls?.length ?? 0) > 1) {
    return (
      <MediaPreview
        items={result.preview_info!.media_urls!.map((u) => ({ url: u, type: 'image' as const, label: result.title }))}
        onClose={onClose}
      />
    )
  }

  if (result.type === 'image' && result.preview_info?.file_url) {
    return (
      <MediaPreview
        url={result.preview_info.file_url}
        type="image"
        alt={result.title}
        onClose={onClose}
      />
    )
  }

  if (result.type === 'video' && result.preview_info?.file_url) {
    return (
      <MediaPreview
        url={result.preview_info.file_url}
        type="video"
        alt={result.title}
        onClose={onClose}
      />
    )
  }

  if (result.type === 'article') {
    return (
      <ArticlePreviewLoader
        generationId={result.generation_id}
        title={result.title}
        onClose={onClose}
      />
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// 文章预览：先拉取完整内容，再用 DocumentPreviewModal 渲染 Markdown
// ---------------------------------------------------------------------------

function ArticlePreviewLoader({
  generationId,
  title,
  onClose,
}: {
  generationId: string
  title?: string
  onClose: () => void
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let objectUrl: string
    generationApi
      .get(generationId)
      .then((d) => {
        const blob = new Blob([d.content ?? ''], { type: 'text/plain; charset=utf-8' })
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
      })
      .catch(() => setBlobUrl(''))
      .finally(() => setLoading(false))

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [generationId])

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-foreground/80">加载中…</p>
        </div>
      </div>
    )
  }

  if (!blobUrl) return null

  return (
    <>
      <DocumentPreviewModal
        url={blobUrl}
        fileName="article.md"
        fileType="md"
        title={title ?? '文章预览'}
        onClose={onClose}
      />
      {/* 查看详情按钮悬浮在预览弹窗上方 */}
      <a
        href={`/generation/library/${generationId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-[10001] inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-bg-deep shadow-lg hover:opacity-90 transition-app"
      >
        查看详情
        <ArrowRight className="size-4" aria-hidden />
      </a>
    </>
  )
}
