import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Clapperboard,
  Clock,
  Copy,
  Crown,
  Download,
  FileText,
  ImageIcon,
  Info,
  Library,
  Loader2,
  Maximize2,
  Play,
  Sliders,
  Sparkles,
  Tag,
  Trash2,
  User2,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Badge } from '@/components/common/Badge'
import { Button } from '@/components/common/Button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { MediaPreview } from '@/components/common/MediaPreview'
import { trackEvent, EVENTS } from '@/utils/tracking'
import { DocumentPreviewModal } from '@/components/common/DocumentPreview'
import { toast } from '@/components/common/Toast'
import { downloadFile } from '@/utils/download'
import MarkDown2 from '@/components/markdown2/index'
import { generationApi } from '@/api/generation'
import { skillsApi } from '@/api/skills'
import type { ContentType, GeneratedContent, GenerationStatus, PublishStatus, ReferenceConfig } from '@/types/generation'
import { PageContainer } from '@/components/shared'
import { formatDate } from '@/utils/format'
import { cn } from '@/utils/helpers'
import { modelLabelByType } from '@/utils/modelLabels'
import { ROUTES } from '@/utils/constants'

const TYPE_ICON: Record<ContentType, React.ReactNode> = {
  article: <FileText className="size-4" />,
  image: <ImageIcon className="size-4" />,
  video: <Clapperboard className="size-4" />,
}

const TYPE_LABEL: Record<ContentType, string> = {
  article: '文章',
  image: '图片',
  video: '视频',
}

const TYPE_COLOR: Record<ContentType, { badge: string; text: string; border: string; gradient: string }> = {
  article: {
    badge: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/25',
    gradient: 'from-blue-500/25 to-cyan-500/25',
  },
  image: {
    badge: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/25',
    gradient: 'from-emerald-500/20 to-primary/20',
  },
  video: {
    badge: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/25',
    gradient: 'from-rose-500/20 to-amber-500/20',
  },
}

function statusBadgeVariant(s: GenerationStatus): 'default' | 'success' | 'warning' | 'danger' {
  switch (s) {
    case 'completed': return 'success'
    case 'failed': return 'danger'
    case 'generating': return 'warning'
    default: return 'default'
  }
}

function publishBadgeVariant(s: PublishStatus): 'default' | 'success' | 'warning' {
  switch (s) {
    case 'published': return 'success'
    case 'ready': return 'warning'
    default: return 'default'
  }
}

const PUBLISH_LABEL: Record<PublishStatus, string> = {
  draft: '草稿',
  ready: '待发布',
  published: '已发布',
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground/70">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground/70 mb-0.5">{label}</p>
        <div className="text-sm text-foreground/80 break-words">{value}</div>
      </div>
    </div>
  )
}

/** 把 reference 配置转成一句可读摘要，用于详情页展示。 */
function describeReference(ref: ReferenceConfig | undefined): string | null {
  if (!ref || !ref.mode) return null
  if (ref.mode === 'auto') return '检索知识库（参考企业档案，文章按需检索文档）'
  if (ref.mode === 'none') return '不参考任何内容'
  const dims: [keyof ReferenceConfig, string][] = [
    ['company_ids', '公司'], ['brand_ids', '品牌'], ['product_ids', '产品'],
    ['customer_ids', '客户'], ['case_ids', '案例'], ['document_ids', '文档'],
  ]
  const parts = dims
    .map(([k, label]) => {
      const arr = ref[k]
      return Array.isArray(arr) && arr.length ? `${label}×${arr.length}` : null
    })
    .filter(Boolean)
  return parts.length ? `自定义：${parts.join('、')}` : '自定义（未选内容）'
}

function ParameterTag({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-muted/40 border border-border px-2.5 py-1 text-xs">
      <span className="text-muted-foreground/70">{label}:</span>
      <span className="text-foreground/80 font-medium">{value}</span>
    </span>
  )
}

const GENERATING_HINT: Record<ContentType, { title: string; sub: string; eta: string }> = {
  article: {
    title: '正在生成文章',
    sub: '调用大模型撰写中，请耐心稍候…',
    eta: '生成完成后会自动在下方展示完整内容',
  },
  image: {
    title: '正在生成图片',
    sub: '提示词送入模型渲染中，请耐心稍候…',
    eta: '生成完成后图片会自动展示在下方',
  },
  video: {
    title: '正在生成视频',
    sub: '视频生成较耗算力，请耐心稍候…',
    eta: '生成完成后视频会自动展示在下方，期间可离开页面',
  },
}

function GeneratingPlaceholder({
  type,
  status,
}: {
  type: ContentType
  status: 'pending' | 'generating'
}) {
  const hint = GENERATING_HINT[type]
  const color = TYPE_COLOR[type]
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('card-elevated relative overflow-hidden')}
    >
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-30', color.gradient)} aria-hidden />
      <div className="relative flex flex-col items-center gap-5 px-6 py-12 text-center sm:py-16">
        {/* 大 spinner + 渐变光环 */}
        <div className="relative">
          <div className={cn('absolute inset-0 -m-2 animate-pulse rounded-full bg-gradient-to-br opacity-60 blur-lg', color.gradient)} aria-hidden />
          <div className={cn('relative flex size-16 items-center justify-center rounded-2xl border bg-background/80 backdrop-blur-sm', color.border)}>
            <Loader2 className={cn('size-8 animate-spin', color.text)} strokeWidth={2.25} aria-hidden />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-center gap-1.5">
            <Sparkles className={cn('size-4', color.text)} strokeWidth={2.25} aria-hidden />
            <h2 className="text-lg font-semibold text-foreground">{hint.title}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{hint.sub}</p>
          <p className="mt-1 text-xs text-muted-foreground/70">{hint.eta}</p>
        </div>

        {/* 渐变进度条 indeterminate 动画 */}
        <div className="w-full max-w-xs overflow-hidden rounded-full bg-muted">
          <div className={cn('h-1.5 w-1/3 animate-[shimmer_1.6s_ease-in-out_infinite] rounded-full bg-gradient-to-r', color.gradient)} />
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
          <span className="relative flex size-1.5">
            <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', color.text.includes('blue') ? 'bg-blue-500' : color.text.includes('emerald') ? 'bg-emerald-500' : 'bg-rose-500')} />
            <span className={cn('relative inline-flex size-1.5 rounded-full', color.text.includes('blue') ? 'bg-blue-500' : color.text.includes('emerald') ? 'bg-emerald-500' : 'bg-rose-500')} />
          </span>
          {status === 'pending' ? '已加入队列，等待处理' : '正在调用模型生成…'}
          <span className="text-muted-foreground/70">· 每 4s 自动刷新</span>
        </div>
      </div>
    </motion.div>
  )
}

export default function GeneratedContentDetailPage() {
  useTranslation() // i18n side-effect for child components
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [item, setItem] = useState<GeneratedContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [showLightbox, setShowLightbox] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [showRefPreview, setShowRefPreview] = useState(false)
  const [showDocPreview, setShowDocPreview] = useState(false)
  const [articleBlobUrl, setArticleBlobUrl] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null)
  const [skillName, setSkillName] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    generationApi.get(id)
      .then((data) => setItem(data))
      .catch(() => toast.error('加载详情失败'))
      .finally(() => setLoading(false))
  }, [id])

  // 本次生成所用「创作技巧」：按 parameters.skill_id 反查名称做溯源展示。
  // 依赖原始字符串而非 parameters 对象，避免轮询每次刷新都重复请求。
  const skillId = (item?.parameters as Record<string, unknown> | null)?.skill_id as string | undefined
  useEffect(() => {
    if (!skillId) return
    let cancelled = false
    skillsApi.get(skillId)
      .then((s) => { if (!cancelled) setSkillName(s?.name ?? null) })
      .catch(() => { if (!cancelled) setSkillName(null) })
    return () => { cancelled = true }
  }, [skillId])

  // 进行中状态自动轮询（pending / generating）— 每 4s 刷新一次直到完成或失败
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!id) return
    const active = item?.status === 'pending' || item?.status === 'generating'
    if (!active) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    if (pollRef.current) return // 已在轮询
    pollRef.current = setInterval(() => {
      generationApi.get(id)
        .then((data) => {
          setItem(data)
          if (data.status === 'completed') {
            toast.success('生成完成')
          } else if (data.status === 'failed') {
            toast.error(data.error_message || '生成失败')
          }
        })
        .catch(() => {/* 静默重试 */})
    }, 4000)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [id, item?.status])

  const openArticlePreview = useCallback(() => {
    if (!item?.content) return
    const url = URL.createObjectURL(
      new Blob([item.content], { type: 'text/markdown;charset=utf-8' }),
    )
    setArticleBlobUrl(url)
    setShowDocPreview(true)
  }, [item?.content])

  const closeArticlePreview = useCallback(() => {
    setShowDocPreview(false)
    if (articleBlobUrl) {
      URL.revokeObjectURL(articleBlobUrl)
      setArticleBlobUrl(null)
    }
  }, [articleBlobUrl])

  const handleExport = async (format: 'docx' | 'pdf') => {
    if (!id || !item) return
    setExporting(format)
    trackEvent(EVENTS.EXPORT_START, { type: item.type, format })
    try {
      const filename = item.title?.slice(0, 60) || 'article'
      await generationApi.exportArticle(id, format, filename)
      trackEvent(EVENTS.EXPORT_SUCCESS, { type: item.type, format })
      toast.success(format === 'pdf' ? 'PDF 已下载' : 'Word 文档已下载')
    } catch {
      trackEvent(EVENTS.EXPORT_FAILED, { type: item.type, format })
      toast.error('导出失败，请稍后重试')
    } finally {
      setExporting(null)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    try {
      await generationApi.delete(id)
      toast.success('已删除')
      navigate(ROUTES.GENERATION_LIBRARY, { replace: true })
    } catch {
      toast.error('删除失败')
    }
  }

  if (loading) {
    return (
      <PageContainer size="lg">
        <div className="space-y-6">
          <div className="h-8 w-48 rounded-xl bg-muted shimmer" />
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="h-80 rounded-xl border border-border bg-muted shimmer" />
            <div className="h-80 rounded-xl border border-border bg-muted shimmer" />
          </div>
        </div>
      </PageContainer>
    )
  }

  if (!item) {
    return (
      <PageContainer size="lg">
        <p className="py-20 text-center text-muted-foreground">记录不存在</p>
      </PageContainer>
    )
  }

  const color = TYPE_COLOR[item.type]
  const params = (item.parameters ?? {}) as Record<string, unknown>
  const brandInfo = params.brand_info as string | undefined  // 旧记录兼容
  const referenceText = describeReference(params.reference as ReferenceConfig | undefined)
  const templateLabel = params.template_label as string | undefined
  const size = params.size as string | undefined
  const resolution = params.resolution as string | undefined
  const duration = params.duration as number | undefined
  const hasRefImage = !!(params.image_url as string | undefined)
  const refImageUrl = params.image_url as string | undefined

  const isArticle = item.type === 'article'
  const isImage = item.type === 'image'
  const isVideo = item.type === 'video'

  // 图片展示用的全部图（图文分离多图取 media_urls，单图回退 file_path）
  const imageList: string[] =
    item.media_urls && item.media_urls.length > 0
      ? (item.media_urls.filter(Boolean) as string[])
      : item.file_path
        ? [item.file_path]
        : []
  // 形态徽章文案
  const layoutLabel = item.layout === 'mixed' ? '图文混编' : item.layout === 'dynamic' ? '图文动态' : null

  return (
    <PageContainer size="lg">
      <div className="space-y-6">
      {/* 返回 */}
      <button
        type="button"
        onClick={() => navigate(ROUTES.GENERATION_LIBRARY)}
        className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="size-4" />
        <span>返回内容库</span>
      </button>

      {/* 头部 */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br border', `bg-gradient-to-br ${color.gradient}`, color.border)}>
            <span className={color.text}>{TYPE_ICON[item.type]}</span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border', color.badge, color.text, color.border)}>
                {TYPE_ICON[item.type]}
                {TYPE_LABEL[item.type]}
              </span>
              {layoutLabel && (
                <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {layoutLabel}
                </span>
              )}
              <Badge variant={statusBadgeVariant(item.status)} size="sm">
                {(item.status === 'pending' || item.status === 'generating') && (
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                )}
                {item.status === 'completed' ? '已完成' : item.status === 'generating' ? '生成中' : item.status === 'pending' ? '待处理' : '失败'}
              </Badge>
              <Badge variant={publishBadgeVariant(item.publish_status)} size="sm">
                {PUBLISH_LABEL[item.publish_status]}
              </Badge>
            </div>
            <h1 className="text-xl font-bold text-foreground line-clamp-2">
              {item.title || item.prompt?.slice(0, 80) || '无标题'}
            </h1>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isArticle && item.content && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={exporting === 'pdf'}
                onClick={() => handleExport('pdf')}
              >
                <FileText className="size-4 text-red-400" />
                <span className="text-red-400">导出 PDF</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={exporting === 'docx'}
                onClick={() => handleExport('docx')}
              >
                <FileText className="size-4 text-blue-400" />
                <span className="text-blue-400">导出 Word</span>
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={openArticlePreview}>
                <FileText className="size-4" />
                预览文章
              </Button>
            </>
          )}
          {(isImage || isVideo) && item.file_path && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowLightbox(true)}>
              <Play className="size-4" />
              {isImage ? '预览图片' : '播放视频'}
            </Button>
          )}
          {item.file_path && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  // 跨域 URL（MinIO）下 <a download> 会被浏览器忽略并退化为预览，
                  // 必须 fetch Blob 后用临时 anchor click 强制触发下载
                  const ext = item.file_path!.split('.').pop()?.split('?')[0] || 'bin'
                  const base = (item.title || `${item.type}-${item.id}`).replace(/[\\/:*?"<>|]/g, '_')
                  await downloadFile(item.file_path!, `${base}.${ext}`)
                } catch (e) {
                  console.error('[Download] failed', e)
                  toast.error('下载失败，请检查网络或稍后重试')
                }
              }}
            >
              <Download className="size-3.5" />
              下载
            </Button>
          )}
          <Button type="button" variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" />
            删除
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* 左侧：主内容 / 预览 */}
        <div className="space-y-5">
          {/* 生成中占位：pending / generating 状态下大尺寸提示 */}
          {(item.status === 'pending' || item.status === 'generating') && (
            <GeneratingPlaceholder type={item.type} status={item.status} />
          )}

          {/* 图片预览区：单图大图 / 多图网格 */}
          {isImage && imageList.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-elevated overflow-hidden"
            >
              {imageList.length === 1 ? (
                <button
                  type="button"
                  className="block w-full cursor-pointer border-0 bg-transparent p-0"
                  onClick={() => { setLightboxIndex(0); setShowLightbox(true) }}
                >
                  <img
                    src={imageList[0]}
                    alt={item.title ?? ''}
                    className="w-full object-contain max-h-[480px] hover:opacity-90 transition-opacity"
                    loading="lazy"
                  />
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 p-1.5 sm:grid-cols-3">
                  {imageList.map((u, i) => (
                    <button
                      key={u}
                      type="button"
                      className="group relative aspect-square overflow-hidden rounded-lg border-0 bg-muted/40 p-0 cursor-pointer"
                      onClick={() => { setLightboxIndex(i); setShowLightbox(true) }}
                    >
                      <img
                        src={u}
                        alt={`${item.title ?? ''} ${i + 1}`}
                        className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
              <div className="px-4 py-2.5 border-t border-border">
                <p className="text-xs text-muted-foreground/70">
                  {imageList.length > 1 ? `共 ${imageList.length} 张 · 点击查看大图` : '点击图片可全屏预览'} · 尺寸：{size ?? '—'}
                </p>
              </div>
            </motion.div>
          )}

          {/* 视频预览区 */}
          {isVideo && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-elevated overflow-hidden"
            >
              {item.thumbnail_path ? (
                <button
                  type="button"
                  className="relative block w-full cursor-pointer border-0 bg-transparent p-0"
                  onClick={() => setShowLightbox(true)}
                >
                  <img
                    src={item.thumbnail_path}
                    alt=""
                    className="w-full object-cover max-h-[360px]"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/20 transition-colors">
                    <div className="flex size-14 items-center justify-center rounded-full bg-black/60 ring-2 ring-rose-500/40">
                      <Play className="size-7 translate-x-0.5 text-white" />
                    </div>
                  </div>
                </button>
              ) : item.file_path ? (
                <video
                  src={item.file_path}
                  controls
                  className="w-full max-h-[360px] bg-black"
                  preload="metadata"
                />
              ) : (
                <div className="flex h-40 items-center justify-center">
                  <Clapperboard className="size-12 text-rose-500/30" />
                </div>
              )}
              <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
                <p className="text-xs text-muted-foreground/70">
                  {resolution && `分辨率：${resolution}`}{duration ? `  时长：${duration}s` : ''}
                </p>
                {item.file_path && (
                  <button
                    type="button"
                    className="text-xs text-rose-500 hover:underline"
                    onClick={() => setShowLightbox(true)}
                  >
                    全屏播放
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* 文章内容预览 */}
          {isArticle && item.content && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-elevated overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <span className="text-sm font-medium text-foreground/80">文章内容</span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(item.content ?? '')
                      toast.success('文章内容已复制')
                    }}
                  >
                    <Copy className="size-3.5" />
                    复制
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={openArticlePreview}>
                    <Maximize2 className="size-3.5" />
                    全屏预览
                  </Button>
                </div>
              </div>
              <div className="p-5 max-h-[480px] overflow-y-auto">
                <MarkDown2 content={item.content} />
              </div>
            </motion.div>
          )}

          {/* 分发资料：自动生成的发布用文案/简介 + 话题标签（图文混编 / 图文动态 / 图片 / 视频发布时直接带入） */}
          {item.description && (
            <div className="card-elevated p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                  <FileText className="size-4 text-muted-foreground/70" />
                  分发资料
                  {layoutLabel && (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">{layoutLabel}</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(item.description ?? '')
                    toast.success('文案已复制')
                  }}
                >
                  <Copy className="size-3.5" />
                  复制
                </Button>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{item.description}</p>
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">#{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 提示词 */}
          {item.prompt && (
            <div className="card-elevated p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                <Info className="size-4 text-muted-foreground/70" />
                使用的提示词
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{item.prompt}</p>
            </div>
          )}

          {/* 错误信息 */}
          {item.status === 'failed' && item.error_message && (
            <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
              <p className="font-medium mb-1">生成失败原因</p>
              <p className="text-destructive/80">{item.error_message}</p>
            </div>
          )}
        </div>

        {/* 右侧：元数据 */}
        <aside className="space-y-5">
          {/* 生成参数 */}
          <div className="card-elevated p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
              <Sliders className="size-4 text-muted-foreground/70" />
              生成参数
            </h2>
            <div className="flex flex-wrap gap-2">
              {(item.model_name || item.model_provider) && (
                <ParameterTag
                  label="模型"
                  value={item.model_name || modelLabelByType(item.type, item.model_provider)}
                />
              )}
              {size && <ParameterTag label="尺寸" value={size} />}
              {resolution && <ParameterTag label="分辨率" value={resolution} />}
              {duration != null && <ParameterTag label="时长" value={`${duration}s`} />}
              {templateLabel && <ParameterTag label="模板" value={templateLabel} />}
              {hasRefImage && <ParameterTag label="参考图" value="已使用" />}
              {skillId && skillName && (
                <ParameterTag
                  label="创作大师"
                  value={<span className="inline-flex items-center gap-1"><Crown className="size-3 text-primary" />{skillName}</span>}
                />
              )}
            </div>
            {!item.model_provider && !size && !resolution && !duration && !templateLabel && !(skillId && skillName) && (
              <p className="text-xs text-muted-foreground/70">暂无参数记录</p>
            )}
          </div>

          {/* 参考内容（新）/ 品牌信息（旧记录兼容） */}
          {(referenceText || brandInfo) && (
            <div className="card-elevated p-5 space-y-2">
              <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                <Tag className="size-4 text-muted-foreground/70" />
                {referenceText ? '参考内容' : '品牌信息'}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-6">{referenceText || brandInfo}</p>
            </div>
          )}

          {/* 参考图 */}
          {refImageUrl && (
            <div className="card-elevated p-5 space-y-2">
              <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                <ImageIcon className="size-4 text-muted-foreground/70" />
                参考图
              </h2>
              <button
                type="button"
                onClick={() => setShowRefPreview(true)}
                className="block w-full cursor-pointer"
              >
                <img
                  src={refImageUrl}
                  alt="参考图"
                  className="w-full rounded-xl object-cover max-h-32 hover:opacity-90 transition-opacity"
                  loading="lazy"
                />
              </button>
            </div>
          )}

          {/* 时间元数据 */}
          <div className="card-elevated p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
              <CalendarDays className="size-4 text-muted-foreground/70" />
              记录信息
            </h2>
            <InfoRow icon={<Clock className="size-3.5" />} label="创建时间" value={formatDate(item.created_at)} />
            <InfoRow icon={<Clock className="size-3.5" />} label="更新时间" value={formatDate(item.updated_at)} />
            <InfoRow icon={<Library className="size-3.5" />} label="发布状态" value={PUBLISH_LABEL[item.publish_status]} />
            <InfoRow icon={<User2 className="size-3.5" />} label="内容 ID" value={<span className="font-mono text-xs break-all">{item.id}</span>} />
          </div>
        </aside>
      </div>

      {/* 文章预览 Modal */}
      {showDocPreview && articleBlobUrl && (
        <DocumentPreviewModal
          url={articleBlobUrl}
          fileName="article.md"
          fileType="md"
          title={item.title ?? undefined}
          onClose={closeArticlePreview}
        />
      )}

      {/* 图片 / 视频全屏预览（图片多图走 items 轮播） */}
      {showLightbox && isImage && imageList.length > 0 && (
        <MediaPreview
          items={imageList.map((u) => ({ url: u, type: 'image' as const, label: item.title ?? undefined }))}
          startIndex={lightboxIndex}
          onClose={() => setShowLightbox(false)}
        />
      )}
      {showLightbox && isVideo && item.file_path && (
        <MediaPreview
          url={item.file_path}
          type="video"
          alt={item.title ?? item.prompt ?? ''}
          coverUrl={item.thumbnail_path ?? undefined}
          onClose={() => setShowLightbox(false)}
        />
      )}

      {/* 参考图全屏预览 */}
      {showRefPreview && refImageUrl && (
        <MediaPreview
          url={refImageUrl}
          type="image"
          alt="参考图"
          onClose={() => setShowRefPreview(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="删除确认"
        message="确定永久删除此生成记录？此操作不可恢复。"
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
      </div>
    </PageContainer>
  )
}
