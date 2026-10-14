import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronUp, Eye, Languages, Loader2, Mic, MicOff, Trash2, Upload } from 'lucide-react'
import { audiosApi } from '@/api/audios'
import { ApiError } from '@/types/api'
import { Button } from '@/components/common/Button'
import { Modal } from '@/components/common/Modal'
import { BatchUploadPanel } from '@/components/form/BatchUploadPanel'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { MediaPreview } from '@/components/common/MediaPreview'
import { Pagination } from '@/components/common/Pagination'
import { toast } from '@/components/common/Toast'
import { EmptyState, PageContainer, PageHeader } from '@/components/shared'
import { usePagination } from '@/hooks/usePagination'
import { formatDate, formatDuration, formatFileSize } from '@/utils/format'

const POLL_INTERVAL = 4000

type Segment = { id?: number; start: number; end: number; text: string }

type AudioItem = {
  id: string
  title?: string | null
  file_name?: string | null
  file_path: string
  file_size?: number | null
  mime_type?: string | null
  duration?: number | null
  language?: string | null
  transcript?: string | null
  segments?: Segment[] | null
  source: string
  status: string
  error_message?: string | null
  document_id?: string | null
  created_at: string
}

function StatusBadge({ status }: { status: string }) {
  const base = 'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold'
  if (status === 'pending')
    return (
      <span className={`${base} border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400`}>
        <Loader2 className="size-3 animate-spin" />
        等待转录
      </span>
    )
  if (status === 'processing')
    return (
      <span className={`${base} border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400`}>
        <Loader2 className="size-3 animate-spin" />
        转录中
      </span>
    )
  if (status === 'failed')
    return <span className={`${base} border-destructive/25 bg-destructive/10 text-destructive`}>转录失败</span>
  return (
    <span className={`${base} border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`}>
      已转录
    </span>
  )
}

function AudioCard({
  audio,
  onDelete,
  onPreview,
  index,
}: {
  audio: AudioItem
  onDelete: () => void
  onPreview: () => void
  index: number
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="flex flex-col overflow-hidden card-base card-hover"
    >
      <div className="h-0.5 bg-gradient-to-r from-sky-400 via-emerald-400 to-amber-400" />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-sky-500/25 bg-gradient-to-br from-sky-500/20 to-violet-500/20 text-sky-600 dark:text-sky-400 shadow-xs">
            {audio.status === 'completed' ? (
              <Mic className="size-5" strokeWidth={2.25} />
            ) : (
              <MicOff className="size-5 text-muted-foreground" strokeWidth={2.25} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium text-foreground">
              {audio.title || audio.file_name || '未命名音频'}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {audio.duration != null && <span>{formatDuration(audio.duration)}</span>}
              {audio.file_size && <span>{formatFileSize(audio.file_size)}</span>}
              {audio.language && (
                <span className="flex items-center gap-0.5">
                  <Languages className="size-3" />
                  {audio.language.toUpperCase()}
                </span>
              )}
              <StatusBadge status={audio.status} />
            </div>
          </div>
        </div>

        {audio.status === 'completed' && (
          <audio
            src={audio.file_path}
            controls
            className="h-9 w-full rounded-lg"
            preload="none"
          />
        )}

        {audio.status === 'completed' && audio.transcript && (
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p
              className={`text-sm leading-relaxed text-foreground/80 ${expanded ? '' : 'line-clamp-3'}`}
            >
              {audio.transcript}
            </p>
            {audio.transcript.length > 200 && (
              <button
                type="button"
                className="mt-2 flex cursor-pointer items-center gap-1 text-xs font-medium text-sky-600 transition-colors hover:text-sky-700 dark:text-sky-400"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? (
                  <>
                    <ChevronUp className="size-3.5" />
                    收起
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3.5" />
                    展开全文 ({audio.transcript.length} 字)
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {audio.status === 'failed' && audio.error_message && (
          <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {audio.error_message}
          </p>
        )}

        {(audio.status === 'pending' || audio.status === 'processing') && (
          <div className="flex items-center gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2">
            <Loader2 className="size-4 shrink-0 animate-spin text-sky-600 dark:text-sky-400" />
            <span className="text-xs text-sky-700 dark:text-sky-400">
              Whisper 正在转录，完成后自动更新…
            </span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-xs text-muted-foreground/80">{formatDate(audio.created_at)}</span>
          <div className="flex items-center gap-1">
            {audio.status === 'completed' && (
              <button
                type="button"
                onClick={onPreview}
                className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-400"
                aria-label="预览"
              >
                <Eye className="size-3.5" />
                预览
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label="删除"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </motion.article>
  )
}

export default function AudiosPage() {
  const { t } = useTranslation()
  const { page, pageSize, total, pages, setTotal, onChange } = usePagination(20)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<AudioItem[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const data = (await audiosApi.list({ page, page_size: pageSize })) as any
      const items = data.items as AudioItem[]
      setRows(items)
      setTotal(data.total as number)
      return items
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '加载失败'
      toast.error(msg)
      setRows([])
      setTotal(0)
      return []
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, setTotal])

  const startPoll = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const data = (await audiosApi.list({ page, page_size: pageSize })) as any
        const items = data.items as AudioItem[]
        setRows(items)
        setTotal(data.total as number)
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
      await audiosApi.delete(deleteId)
      toast.success('已删除')
      setDeleteId(null)
      await loadList()
    } catch {
      toast.error('删除失败')
    }
  }

  return (
    <PageContainer size="xl">
      <PageHeader
        title="音频"
        description="上传和管理音频资源，支持会议录音，将自动转录为文本。"
        icon={Mic}
        iconAccent="audio"
        breadcrumbs={[{ label: '资产管理' }, { label: '媒体' }, { label: '音频' }]}
        actions={
          <Button type="button" variant="primary" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4" />
            上传音频
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl border border-border bg-muted shimmer" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card-elevated p-2">
          <EmptyState icon={Mic} title="暂无音频，点击上传开始转录" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((audio, idx) => (
            <AudioCard
              key={audio.id}
              audio={audio}
              index={idx}
              onDelete={() => setDeleteId(audio.id)}
              onPreview={() => setPreviewIdx(idx)}
            />
          ))}
        </div>
      )}

      {total > 0 && (
        <Pagination page={page} pages={pages} pageSize={pageSize} total={total} onChange={onChange} />
      )}

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="上传音频" size="lg">
        <BatchUploadPanel
          accept={{
            'audio/*': ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.webm'],
          }}
          maxSize={50 * 1024 * 1024}
          hint="支持批量上传，单次最多 20 个文件，自动转录、支持多语言"
          uploadOne={(file) => audiosApi.upload(file)}
          onUploaded={() => void handleUploaded()}
          onClose={() => setUploadOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        open={deleteId != null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
        title="删除音频？"
        message="同时删除对应的转录文档和知识库索引，操作不可撤销。"
        variant="danger"
        confirmText={t('common.delete', 'Delete')}
      />

      {previewIdx !== null && (() => {
        const completedRows = rows.filter(a => a.status === 'completed')
        const clickedAudio = rows[previewIdx]
        const startIndex = completedRows.findIndex(a => a.id === clickedAudio?.id)
        return (
          <MediaPreview
            items={completedRows.map(a => ({
              url: a.file_path,
              type: 'audio' as const,
              label: a.title ?? a.file_name ?? '未命名音频',
            }))}
            startIndex={startIndex >= 0 ? startIndex : 0}
            onClose={() => setPreviewIdx(null)}
          />
        )
      })()}
    </PageContainer>
  )
}
