import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Film, Loader2, Play, Trash2, Upload } from 'lucide-react'
import { videosApi } from '@/api/videos'
import { ApiError } from '@/types/api'
import { Button } from '@/components/common/Button'
import { Modal } from '@/components/common/Modal'
import { BatchUploadPanel } from '@/components/form/BatchUploadPanel'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Pagination } from '@/components/common/Pagination'
import { MediaPreview } from '@/components/common/MediaPreview'
import { toast } from '@/components/common/Toast'
import { EmptyState, PageContainer, PageHeader } from '@/components/shared'
import { usePagination } from '@/hooks/usePagination'
import { formatDate, formatDuration } from '@/utils/format'
import { FILE_LIMITS } from '@/utils/constants'

const POLL_INTERVAL = 3000

type VideoItem = {
  id: string
  title?: string | null
  file_name?: string | null
  file_path: string
  cover_path?: string | null
  duration?: number | null
  resolution?: string | null
  file_size?: number | null
  mime_type?: string | null
  source: string
  status: string
  error_message?: string | null
  created_at: string
}

export default function VideosPage() {
  const { t } = useTranslation()
  const { page, pageSize, total, pages, setTotal, onChange } = usePagination(20)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<VideoItem[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const data = await videosApi.list({ page, page_size: pageSize })
      const items = data.items as VideoItem[]
      setRows(items)
      setTotal(data.total)
      return items
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('videos.loadError')
      toast.error(msg)
      setRows([])
      setTotal(0)
      return []
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, setTotal, t])

  const startPoll = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const data = await videosApi.list({ page, page_size: pageSize })
        const items = data.items as VideoItem[]
        setRows(items)
        setTotal(data.total)
        const hasInProgress = items.some(i => i.status === 'pending' || i.status === 'processing')
        if (!hasInProgress) { clearInterval(pollRef.current!); pollRef.current = null }
      } catch { /* 静默 */ }
    }, POLL_INTERVAL)
  }, [page, pageSize, setTotal])

  useEffect(() => {
    void loadList().then(items => {
      if (items.some(i => i.status === 'pending' || i.status === 'processing')) startPoll()
    })
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [loadList, startPoll])

  const handleUploaded = async () => {
    onChange(1, pageSize)
    const items = await loadList()
    if (items.some(i => i.status === 'pending' || i.status === 'processing')) startPoll()
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    try {
      await videosApi.delete(deleteId)
      toast.success(t('videos.deleted', 'Video deleted'))
      setDeleteId(null)
      await loadList()
    } catch (e) {
      toast.error(t('videos.deleteFail', 'Delete failed'))
      console.error(e)
    }
  }

  return (
    <PageContainer size="xl">
      <PageHeader
        title={t('dashboard.videos', '视频')}
        description={t('videos.subtitle', '上传和管理视频资产，自动生成封面缩略图。')}
        icon={Film}
        iconAccent="video"
        breadcrumbs={[{ label: '资产管理' }, { label: '媒体' }, { label: t('dashboard.videos', '视频') }]}
        actions={
          <Button type="button" variant="primary" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4" />
            {t('videos.upload', 'Upload')}
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 rounded-xl border border-border bg-muted shimmer" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card-elevated p-2">
          <EmptyState icon={Film} title={t('videos.empty', 'No videos')} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {rows.map((vid, idx) => (
            <motion.article
              key={vid.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: idx * 0.04 }}
              className="group flex flex-col overflow-hidden card-base card-hover"
            >
              <div
                className="relative flex h-40 cursor-pointer items-center justify-center overflow-hidden bg-muted/40"
                onClick={() => vid.status === 'completed' && setPreviewIdx(idx)}
                role="button"
                aria-label="播放视频"
              >
                {vid.cover_path ? (
                  <img
                    src={vid.cover_path}
                    alt={vid.title ?? vid.file_name ?? ''}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <Film className="size-14 text-muted-foreground/40" aria-hidden strokeWidth={1.8} />
                )}
                {(vid.status === 'pending' || vid.status === 'processing') && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 glass-soft">
                    <Loader2 className="size-8 animate-spin text-rose-500" />
                    <span className="text-xs text-muted-foreground">
                      {vid.status === 'pending' ? '等待处理' : '生成缩略图中'}
                    </span>
                  </div>
                )}
                {vid.status === 'completed' && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex size-14 items-center justify-center rounded-full bg-rose-500/90 shadow-pop ring-2 ring-white/40">
                      <Play className="size-7 translate-x-0.5 text-white" />
                    </div>
                  </div>
                )}
                {vid.resolution && vid.status === 'completed' && (
                  <span className="absolute right-2 top-2 rounded-md border border-rose-500/25 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400 backdrop-blur-sm">
                    {vid.resolution}
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2 p-3">
                <h3 className="line-clamp-2 text-sm font-medium text-foreground">
                  {vid.title || vid.file_name || t('videos.untitled', 'Untitled')}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{vid.duration != null ? formatDuration(vid.duration) : '—'}</span>
                  <span className="rounded-md border border-rose-500/25 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                    {vid.source}
                  </span>
                  {vid.status === 'failed' && (
                    <span className="rounded-md border border-destructive/25 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                      处理失败
                    </span>
                  )}
                </div>
                {vid.status === 'failed' && vid.error_message && (
                  <p className="line-clamp-2 text-xs text-destructive">{vid.error_message}</p>
                )}
                <p className="text-xs text-muted-foreground/80">{formatDate(vid.created_at)}</p>
                <div className="mt-auto flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setDeleteId(vid.id)}
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

      {total > 0 && <Pagination page={page} pages={pages} pageSize={pageSize} total={total} onChange={onChange} />}

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title={t('videos.uploadTitle', 'Upload video')} size="lg">
        <BatchUploadPanel
          accept={{ 'video/*': ['.mp4', '.webm', '.mov', '.mkv'] }}
          maxSize={FILE_LIMITS.VIDEO_MAX_SIZE}
          hint="支持批量上传，单次最多 20 个文件，上传后自动生成封面缩略图"
          uploadOne={(file) => videosApi.upload(file)}
          onUploaded={() => void handleUploaded()}
          onClose={() => setUploadOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        open={deleteId != null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
        title={t('videos.confirmDeleteTitle', 'Delete video?')}
        message={t('videos.confirmDeleteBody', 'This cannot be undone.')}
        variant="danger"
        confirmText={t('common.delete', 'Delete')}
      />

      {previewIdx !== null && (() => {
        const completedRows = rows.filter(vid => vid.status === 'completed')
        const clickedVid = rows[previewIdx]
        const startIndex = completedRows.findIndex(vid => vid.id === clickedVid?.id)
        return (
          <MediaPreview
            items={completedRows.map(vid => ({
              url: vid.file_path,
              type: 'video' as const,
              label: vid.title ?? vid.file_name ?? '',
              coverUrl: vid.cover_path ?? undefined,
            }))}
            startIndex={startIndex >= 0 ? startIndex : 0}
            onClose={() => setPreviewIdx(null)}
          />
        )
      })()}
    </PageContainer>
  )
}
