import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { ColumnDef } from '@tanstack/react-table'
import { Clapperboard, Eye, FileText, ImageIcon, LayoutGrid, Library, List, RefreshCw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/common/Badge'
import { Button } from '@/components/common/Button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { DataTable } from '@/components/data/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
import { Pagination } from '@/components/common/Pagination'
import { MediaPreview } from '@/components/common/MediaPreview'
import { DocumentPreviewModal } from '@/components/common/DocumentPreview'
import { toast } from '@/components/common/Toast'
import { PageHeader } from '@/components/shared'
import { generationApi } from '@/api/generation'
import type { ContentType, GeneratedContent, GenerationStatus } from '@/types/generation'
import { useGenerationStore } from '@/stores/generationStore'
import { usePagination } from '@/hooks/usePagination'
import { formatDate } from '@/utils/format'
import { truncate } from '@/utils/helpers'
import { cn } from '@/utils/helpers'
import { modelLabelByType } from '@/utils/modelLabels'

type FilterTab = 'all' | ContentType

const TYPE_ICON: Record<ContentType, React.ReactNode> = {
  article: <FileText className="size-3.5" />,
  image: <ImageIcon className="size-3.5" />,
  video: <Clapperboard className="size-3.5" />,
}

/** 类型短标签（不含"生成"） */
const TYPE_SHORT_LABEL: Record<ContentType, string> = {
  article: '文章',
  image: '图片',
  video: '视频',
}

/** 类型颜色 token：文章=blue(Word 蓝), 图片=green(绿), 视频=purple(紫) */
const TYPE_COLOR: Record<ContentType, { badge: string; text: string; border: string }> = {
  article: { badge: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/25' },
  image:   { badge: 'bg-neon-green/10', text: 'text-neon-green', border: 'border-neon-green/20' },
  video:   { badge: 'bg-neon-pink/10',   text: 'text-neon-pink',   border: 'border-neon-pink/20' },
}

function statusBadgeVariant(s: GenerationStatus): 'default' | 'success' | 'warning' | 'danger' {
  switch (s) {
    case 'completed': return 'success'
    case 'failed': return 'danger'
    case 'generating': return 'warning'
    default: return 'default'
  }
}

function statusLabel(s: GenerationStatus, t: (key: string, fallback: string) => string): string {
  const map: Record<GenerationStatus, string> = {
    pending: t('generation.status.pending', '待处理'),
    generating: t('generation.status.generating', '生成中'),
    completed: t('generation.status.completed', '已完成'),
    failed: t('generation.status.failed', '失败'),
  }
  return map[s] ?? s
}

function TypeBadge({ type }: { type: ContentType }) {
  const color = TYPE_COLOR[type]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border backdrop-blur-sm', color.badge, color.text, color.border)}>
      {TYPE_ICON[type]}
      {TYPE_SHORT_LABEL[type]}
    </span>
  )
}

function ContentCard({
  item,
  onNavigate,
  onPreview,
  onDelete,
  index,
}: {
  item: GeneratedContent
  onNavigate: (id: string) => void
  onPreview: (item: GeneratedContent) => void
  onDelete: (id: string) => void
  index: number
}) {
  const { t } = useTranslation()
  const isImage = item.type === 'image'
  const isVideo = item.type === 'video'
  const hasMedia = (isImage || isVideo) && (item.thumbnail_path || item.file_path)
  // 形态徽章：图文混编 / 图文动态（N 图）
  const imgCount = item.media_urls?.length ?? 0
  const layoutLabel =
    item.layout === 'mixed'
      ? '图文混编'
      : item.layout === 'dynamic'
        ? (imgCount > 1 ? `图文动态 · ${imgCount}图` : '图文动态')
        : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1], delay: index * 0.04 }}
      onClick={() => onNavigate(item.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onNavigate(item.id)}
    >
      {/* 内层 div 承担 card-hover —— framer-motion 留下的 inline transform 会覆盖 CSS hover transform */}
      <div className="glass-card card-hover rounded-2xl border border-white/[0.06] overflow-hidden flex flex-col cursor-pointer h-full">
      {/* 媒体缩略图 */}
      {hasMedia ? (
        <div className="relative aspect-video bg-bg-surface/80 overflow-hidden">
          {isImage && (
            <img
              src={(item.thumbnail_path || item.file_path)!}
              alt={item.title ?? ''}
              className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
              loading="lazy"
            />
          )}
          {isVideo && (
            <div className="relative flex h-full w-full items-center justify-center bg-bg-surface/60">
              {item.thumbnail_path ? (
                <img
                  src={item.thumbnail_path}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <Clapperboard className="size-10 text-neon-pink/40" />
              )}
            </div>
          )}
          <div className="absolute top-2 left-2 pointer-events-none z-[2]">
            <TypeBadge type={item.type} />
          </div>
          {layoutLabel && (
            <div className="absolute top-2 right-2 pointer-events-none z-[2]">
              <span className="rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary backdrop-blur-sm">
                {layoutLabel}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <TypeBadge type={item.type} />
          {layoutLabel && (
            <span className="rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
              {layoutLabel}
            </span>
          )}
        </div>
      )}

      {/* 内容区 */}
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        {item.title && (
          <h3 className="text-sm font-semibold text-text-primary line-clamp-1">{item.title}</h3>
        )}
        {item.prompt && (
          <p className="text-xs text-text-muted line-clamp-2">{truncate(item.prompt, 120)}</p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2">
          <Badge variant={statusBadgeVariant(item.status)} size="sm">
            {statusLabel(item.status, t)}
          </Badge>
          <span className="text-xs text-text-dim whitespace-nowrap shrink-0">{formatDate(item.created_at)}</span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div
        className="flex items-center gap-2 border-t border-border px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        {item.status === 'completed' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onPreview(item)}
          >
            {t('generation.preview', '预览')}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={item.status === 'completed' ? '' : 'flex-1'}
          onClick={() => onNavigate(item.id)}
        >
          {t('common.detail', '详情')}
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
          aria-label={t('common.delete', '删除')}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      </div>
    </motion.div>
  )
}

type ViewMode = 'grid' | 'list'

export default function ContentLibraryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { page, pageSize, setTotal, onChange } = usePagination(20)
  const loadHistory = useGenerationStore((s) => s.loadHistory)
  const loading = useGenerationStore((s) => s.loading)
  const rows = useGenerationStore((s) => s.history)
  const historyTotal = useGenerationStore((s) => s.historyTotal)

  const [filter, setFilter] = useState<FilterTab>('all')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'grid'
    return (localStorage.getItem('content-library:view') as ViewMode) || 'grid'
  })
  const [previewItem, setPreviewItem] = useState<GeneratedContent | null>(null)
  const [articlePreviewUrl, setArticlePreviewUrl] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const typeParam = filter === 'all' ? undefined : filter

  // 持久化用户偏好的视图模式
  useEffect(() => {
    localStorage.setItem('content-library:view', viewMode)
  }, [viewMode])

  const handleNavigate = useCallback((id: string) => {
    navigate(`/generation/library/${id}`)
  }, [navigate])

  const closePreview = useCallback(() => {
    setArticlePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setPreviewItem(null)
  }, [])

  const handlePreview = useCallback((item: GeneratedContent) => {
    if (item.type === 'article' && item.content) {
      setArticlePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(
          new Blob([item.content!], { type: 'text/markdown;charset=utf-8' }),
        )
      })
    } else {
      setArticlePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
    setPreviewItem(item)
  }, [])

  const refresh = useCallback(async () => {
    await loadHistory({ page, page_size: pageSize, type: typeParam })
  }, [loadHistory, page, pageSize, typeParam])

  useEffect(() => {
    void (async () => {
      try {
        await loadHistory({ page, page_size: pageSize, type: typeParam })
      } catch (e) {
        toast.error(t('generation.historyLoadFailed', '加载记录失败'))
        console.error(e)
      }
    })()
  }, [loadHistory, page, pageSize, t, typeParam])

  useEffect(() => {
    setTotal(historyTotal)
  }, [historyTotal, setTotal])

  const confirmDelete = async () => {
    if (!deleteId) return
    try {
      await generationApi.delete(deleteId)
      toast.success(t('generation.deleted', '已删除'))
      setDeleteId(null)
      await refresh()
    } catch (e) {
      toast.error(t('generation.deleteFailed', '删除失败'))
      console.error(e)
    }
  }

  const tabs: { id: FilterTab; label: string; icon: React.ReactNode; activeClass: string }[] = [
    { id: 'all',     label: t('generation.filterAll', '全部'), icon: <Library className="size-3.5" />,      activeClass: 'border-primary/30 bg-primary/10 text-primary' },
    { id: 'article', label: '文章',                            icon: <FileText className="size-3.5" />,     activeClass: 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    { id: 'image',   label: '图片',                            icon: <ImageIcon className="size-3.5" />,    activeClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    { id: 'video',   label: '视频',                            icon: <Clapperboard className="size-3.5" />, activeClass: 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  ]

  // 列表视图列定义
  // 列宽控制：用 nowrap 防止短列（类型/状态/服务商/时间/操作）被挤压；
  // 标题/提示词列用 max-w + truncate 限制长内容溢出，让浏览器按预期分配整行空间
  const columns = useMemo<ColumnDef<GeneratedContent>[]>(
    () => [
      {
        accessorKey: 'type',
        header: t('document.type', '类型'),
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <TypeBadge type={row.original.type} />
          </div>
        ),
      },
      {
        accessorKey: 'title',
        header: t('common.title', '标题'),
        cell: ({ row }) => (
          <div className="max-w-[14rem] truncate font-medium text-foreground">
            {row.original.title || '—'}
          </div>
        ),
      },
      {
        accessorKey: 'prompt',
        header: t('generation.prompt', '提示词'),
        cell: ({ row }) => (
          <div className="max-w-[20rem] truncate text-muted-foreground">
            {truncate(row.original.prompt ?? '', 80)}
          </div>
        ),
      },
      {
        id: 'model_provider',
        header: t('generation.model', '模型'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-foreground/80">
            {modelLabelByType(row.original.type, row.original.model_provider)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: t('document.status', '状态'),
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <Badge variant={statusBadgeVariant(row.original.status)} size="sm">
              {statusLabel(row.original.status, t)}
            </Badge>
          </div>
        ),
      },
      {
        accessorKey: 'created_at',
        header: t('user.createdAt', '创建时间'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.created_at)}</span>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions', '操作'),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
            {row.original.status === 'completed' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePreview(row.original)}
                aria-label={t('generation.preview', '预览')}
              >
                <Eye className="size-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => setDeleteId(row.original.id)}
              aria-label={t('common.delete', '删除')}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [t, handlePreview],
  )

  return (
    <div className="w-full space-y-6 pb-12 md:pb-16">
      <PageHeader
        title={t('menu.contentLibrary', '内容库')}
        description={t('generation.librarySubtitle', '浏览所有已生成的文章、图片和视频内容。')}
        icon={Library}
        iconAccent="primary"
        breadcrumbs={[{ label: '创作分发' }, { label: '内容创作' }, { label: t('menu.contentLibrary', '内容库') }]}
        actions={
          <>
            {/* 视图切换：网格 / 列表 */}
            <div className="inline-flex h-8 items-center rounded-md border border-border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={cn(
                  'flex h-full cursor-pointer items-center gap-1 rounded px-2 text-xs font-medium transition',
                  viewMode === 'grid'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-label={t('common.gridView', '网格视图')}
              >
                <LayoutGrid className="size-3.5" strokeWidth={2.2} />
                <span className="hidden sm:inline">{t('common.gridView', '网格')}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn(
                  'flex h-full cursor-pointer items-center gap-1 rounded px-2 text-xs font-medium transition',
                  viewMode === 'list'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-label={t('common.listView', '列表视图')}
              >
                <List className="size-3.5" strokeWidth={2.2} />
                <span className="hidden sm:inline">{t('common.listView', '列表')}</span>
              </button>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
              {t('common.refresh', '刷新')}
            </Button>
          </>
        }
      />

      {/* 过滤标签 */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setFilter(tab.id); onChange(1, pageSize) }}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-app',
              filter === tab.id
                ? tab.activeClass
                : 'border-border bg-card text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容主体：网格 / 列表 双视图 */}
      {viewMode === 'grid' ? (
        <>
          {loading && rows.length === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-64 rounded-xl border border-border bg-muted shimmer" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title={t('generation.emptyHistory', '暂无生成记录')}
              description={t('generation.emptyLibraryHint', '去文章、图片、视频生成页面创建内容吧。')}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {rows.map((item, i) => (
                <ContentCard
                  key={item.id}
                  item={item}
                  index={i}
                  onNavigate={handleNavigate}
                  onPreview={handlePreview}
                  onDelete={setDeleteId}
                />
              ))}
            </div>
          )}

          {/* 网格视图独立分页 */}
          {historyTotal > pageSize && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={historyTotal}
              onChange={onChange}
            />
          )}
        </>
      ) : (
        // 列表视图：复用 DataTable，行点击跳详情
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          pagination={{
            page,
            pageSize,
            total: historyTotal,
            onChange,
          }}
          onRowClick={(row) => handleNavigate(row.id)}
          emptyText={t('generation.emptyHistory', '暂无生成记录')}
        />
      )}

      {/* 文章预览 */}
      {previewItem?.type === 'article' && articlePreviewUrl && (
        <DocumentPreviewModal
          url={articlePreviewUrl}
          fileName="article.md"
          fileType="md"
          title={previewItem.title ?? undefined}
          onClose={closePreview}
        />
      )}

      {/* 图片全屏预览 */}
      {previewItem?.type === 'image' && previewItem.file_path && (
        <MediaPreview
          url={previewItem.file_path}
          type="image"
          alt={previewItem.title ?? previewItem.prompt ?? ''}
          onClose={closePreview}
        />
      )}

      {/* 视频全屏预览 */}
      {previewItem?.type === 'video' && previewItem.file_path && (
        <MediaPreview
          url={previewItem.file_path}
          type="video"
          alt={previewItem.title ?? previewItem.prompt ?? ''}
          coverUrl={previewItem.thumbnail_path ?? undefined}
          onClose={closePreview}
        />
      )}

      <ConfirmDialog
        open={deleteId != null}
        title={t('common.delete', '删除')}
        message={t('generation.deleteConfirm', '确定永久删除此生成记录？')}
        confirmText={t('common.delete', '删除')}
        cancelText={t('common.cancel', '取消')}
        variant="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleteId(null)}
      />
    </div>
  )
}
