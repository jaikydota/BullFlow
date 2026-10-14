import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ImageIcon, Loader2, Search, Trash2, Upload, ZoomIn } from 'lucide-react'
import { imagesApi } from '@/api/images'
import { ApiError } from '@/types/api'
import { Badge } from '@/components/common/Badge'
import { Button } from '@/components/common/Button'
import { Modal } from '@/components/common/Modal'
import { BatchUploadPanel } from '@/components/form/BatchUploadPanel'
import { SearchInput } from '@/components/common/SearchInput'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Pagination } from '@/components/common/Pagination'
import { MediaPreview } from '@/components/common/MediaPreview'
import { toast } from '@/components/common/Toast'
import { EmptyState, PageContainer, PageHeader } from '@/components/shared'
import { usePagination } from '@/hooks/usePagination'
import { formatDate, formatFileSize } from '@/utils/format'

type ImageItem = {
  id: string
  title?: string | null
  file_name?: string | null
  file_path: string
  thumbnail_path?: string | null
  file_size?: number | null
  width?: number | null
  height?: number | null
  source: string
  status: string
  error_message?: string | null
  created_at: string
  score?: number
}

const POLL_INTERVAL = 3000

function StatusBadge({ status }: { status: string }) {
  if (status === 'pending' || status === 'processing') {
    return (
      <Badge variant="warning" size="sm" className="flex items-center gap-1">
        <Loader2 className="size-3 animate-spin" />
        {status === 'pending' ? '等待中' : '处理中'}
      </Badge>
    )
  }
  if (status === 'failed') return <Badge variant="danger" size="sm">处理失败</Badge>
  return null
}

export default function ImagesPage() {
  const { t } = useTranslation()
  const { page, pageSize, total, pages, setTotal, onChange } = usePagination(20)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ImageItem[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchActive, setSearchActive] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const data = await imagesApi.list({ page, page_size: pageSize })
      const items = data.items as ImageItem[]
      setRows(items)
      setTotal(data.total)
      return items
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('images.loadError')
      toast.error(msg)
      setRows([])
      setTotal(0)
      return []
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, setTotal, t])

  // 轮询：列表中存在 pending/processing 时每 3s 静默刷新
  const startPoll = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const data = await imagesApi.list({ page, page_size: pageSize })
        const items = data.items as ImageItem[]
        setRows(items)
        setTotal(data.total)
        const hasInProgress = items.some(i => i.status === 'pending' || i.status === 'processing')
        if (!hasInProgress) {
          clearInterval(pollRef.current!)
          pollRef.current = null
        }
      } catch {
        // 静默忽略轮询错误
      }
    }, POLL_INTERVAL)
  }, [page, pageSize, setTotal])

  useEffect(() => {
    if (!searchActive) {
      void loadList().then(items => {
        const hasInProgress = items.some(i => i.status === 'pending' || i.status === 'processing')
        if (hasInProgress) startPoll()
      })
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [loadList, searchActive, startPoll])

  const runSearch = async () => {
    const q = search.trim()
    if (!q) { setSearchActive(false); return }
    setSearchLoading(true)
    setSearchActive(true)
    try {
      const data = await imagesApi.search({ query: q, top_k: 48 })
      setRows((data.results ?? []) as ImageItem[])
      setTotal(data.total ?? data.results?.length ?? 0)
    } catch (e) {
      toast.error(t('images.searchFail', 'Search failed'))
      console.error(e)
    } finally {
      setSearchLoading(false)
    }
  }

  const clearSearch = () => {
    setSearch('')
    setSearchActive(false)
    onChange(1, pageSize)
  }

  const handleUploaded = async () => {
    setSearch('')
    setSearchActive(false)
    onChange(1, pageSize)
    const items = await loadList()
    const hasInProgress = items.some(i => i.status === 'pending' || i.status === 'processing')
    if (hasInProgress) startPoll()
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    try {
      await imagesApi.delete(deleteId)
      toast.success(t('images.deleted', 'Image deleted'))
      setDeleteId(null)
      if (searchActive) await runSearch()
      else await loadList()
    } catch (e) {
      toast.error(t('images.deleteFail', 'Delete failed'))
      console.error(e)
    }
  }

  const busy = loading || searchLoading

  return (
    <PageContainer size="xl">
      <PageHeader
        title={t('dashboard.images', '图片')}
        description={t('images.subtitle', '管理图片资产，支持 CLIP 语义搜索。')}
        icon={ImageIcon}
        iconAccent="image"
        breadcrumbs={[{ label: '资产管理' }, { label: '媒体' }, { label: t('dashboard.images', '图片') }]}
        actions={
          <Button type="button" variant="primary" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4" />
            {t('images.upload', 'Upload')}
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-2 rounded-xl border border-border bg-card/80 p-3 shadow-xs sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('images.searchPlaceholder', '搜索标题或语义描述…')}
            className="w-full max-w-xl"
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="primary" onClick={() => void runSearch()} loading={searchLoading}>
            <Search className="size-4" />
            {t('images.search', 'Search')}
          </Button>
          {searchActive ? (
            <Button type="button" variant="ghost" onClick={() => clearSearch()}>
              {t('images.showAll', 'Show all')}
            </Button>
          ) : null}
        </div>
      </div>

      {busy ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 rounded-xl border border-border bg-muted shimmer" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card-elevated p-2">
          <EmptyState icon={ImageIcon} title={t('images.empty', 'No images')} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {rows.map((img, idx) => (
            <motion.article
              key={img.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: idx * 0.03 }}
              className="group flex flex-col overflow-hidden card-base card-hover"
            >
              <div
                className="relative flex h-36 cursor-pointer items-center justify-center overflow-hidden bg-muted/40"
                onClick={() => img.status === 'completed' && setPreviewIdx(idx)}
                role="button"
                aria-label="预览图片"
              >
                <img
                  src={img.thumbnail_path ?? img.file_path}
                  alt={img.title ?? img.file_name ?? ''}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    const el = e.target as HTMLImageElement
                    if (img.thumbnail_path && el.src !== img.file_path) {
                      el.src = img.file_path
                    } else {
                      el.style.display = 'none'
                    }
                  }}
                />
                {img.status === 'completed' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                    <ZoomIn className="size-8 text-white drop-shadow-lg" />
                  </div>
                )}
                {(img.status === 'pending' || img.status === 'processing') && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 glass-soft">
                    <Loader2 className="size-8 animate-spin text-emerald-500" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {img.status === 'pending' ? '等待处理' : '处理中…'}
                    </span>
                  </div>
                )}
                {img.score != null && (
                  <span className="absolute right-2 top-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 backdrop-blur-sm">
                    {img.score <= 1 ? (img.score * 100).toFixed(1) : img.score.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <h3 className="line-clamp-2 text-sm font-medium text-foreground">
                  {img.title || img.file_name || t('images.untitled', 'Untitled')}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{formatFileSize(img.file_size)}</span>
                  <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                    {img.source}
                  </span>
                  <StatusBadge status={img.status} />
                </div>
                {img.status === 'failed' && img.error_message && (
                  <p className="line-clamp-2 text-xs text-destructive" title={img.error_message}>
                    {img.error_message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground/80">{formatDate(img.created_at)}</p>
                <div className="mt-auto flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setDeleteId(img.id)}
                    className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="删除"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      )}

      {!searchActive && total > 0 ? (
        <Pagination page={page} pages={pages} pageSize={pageSize} total={total} onChange={onChange} />
      ) : null}

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title={t('images.uploadTitle', 'Upload image')} size="lg">
        <BatchUploadPanel
          accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] }}
          maxSize={20 * 1024 * 1024}
          hint="支持批量上传，单次最多 20 个文件"
          uploadOne={(file) => imagesApi.upload(file)}
          onUploaded={() => void handleUploaded()}
          onClose={() => setUploadOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        open={deleteId != null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
        title={t('images.confirmDeleteTitle', 'Delete image?')}
        message={t('images.confirmDeleteBody', 'This cannot be undone.')}
        variant="danger"
        confirmText={t('common.delete', 'Delete')}
      />

      {previewIdx !== null && (() => {
        const completedRows = rows.filter(img => img.status === 'completed')
        const clickedImg = rows[previewIdx]
        const startIndex = completedRows.findIndex(img => img.id === clickedImg?.id)
        return (
          <MediaPreview
            items={completedRows.map(img => ({
              url: img.file_path,
              type: 'image' as const,
              label: img.title ?? img.file_name ?? '',
            }))}
            startIndex={startIndex >= 0 ? startIndex : 0}
            onClose={() => setPreviewIdx(null)}
          />
        )
      })()}
    </PageContainer>
  )
}
