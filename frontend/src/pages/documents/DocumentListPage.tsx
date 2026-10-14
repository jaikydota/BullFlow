import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Download,
  FolderOpen,
  LayoutList,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { documentsApi } from '@/api/documents'
import type { Document, DocumentStatus } from '@/types/document'
import { ApiError } from '@/types/api'
import { Button } from '@/components/common/Button'
import { Badge } from '@/components/common/Badge'
import { DataTable } from '@/components/data/DataTable'
import { Modal } from '@/components/common/Modal'
import { BatchUploadPanel } from '@/components/form/BatchUploadPanel'
import { SearchInput } from '@/components/common/SearchInput'
import { Select } from '@/components/common/Select'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { DocumentPreview } from '@/components/common/DocumentPreview'
import { toast } from '@/components/common/Toast'
import { PageContainer, PageHeader } from '@/components/shared'
import { usePagination } from '@/hooks/usePagination'
import { formatDate, formatFileSize } from '@/utils/format'
import { cn } from '@/utils/helpers'
import { getFileMeta } from '@/utils/fileTypes'

const ACCEPT: Record<string, string[]> = {
  // PDF
  'application/pdf': ['.pdf'],
  // Word
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  // Excel
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  // PowerPoint
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  // 文本 / 表格 / Markdown
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'text/markdown': ['.md'],
  // 网页
  'text/html': ['.html', '.htm'],
  // 电子书 / 富文本 / OpenDocument
  'application/epub+zip': ['.epub'],
  'application/rtf': ['.rtf'],
  'text/rtf': ['.rtf'],
  'application/vnd.oasis.opendocument.text': ['.odt'],
}

function FileTypeIcon({ fileType }: { fileType: string }) {
  const meta = getFileMeta(fileType)
  const Icon = meta.icon
  return <Icon className={cn('size-4 shrink-0', meta.iconClass)} aria-hidden />
}

function FileTypeBadge({ fileType }: { fileType: string }) {
  const meta = getFileMeta(fileType)
  return (
    <span className={cn('badge text-[10px]', meta.badgeClass)}>
      {meta.label || fileType.toUpperCase()}
    </span>
  )
}

function FileFormatBadge({ fileType }: { fileType: string }) {
  const meta = getFileMeta(fileType)
  const ext = fileType ? `.${fileType.toLowerCase()}` : '—'
  return (
    <span className={cn('font-mono text-xs tracking-wide', meta.iconClass)}>
      {ext}
    </span>
  )
}

const STATUS_LABEL: Record<DocumentStatus, string> = {
  pending: '待处理',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
}

function StatusBadge({
  status,
  chunkCount,
  errorMessage,
}: {
  status: DocumentStatus
  chunkCount: number | null
  errorMessage: string | null
}) {
  const map: Record<DocumentStatus, { variant: 'warning' | 'info' | 'success' | 'danger'; pulse?: boolean }> = {
    pending: { variant: 'warning' },
    processing: { variant: 'info', pulse: true },
    completed: { variant: 'success' },
    failed: { variant: 'danger' },
  }
  const cfg = map[status]
  const isStorageOnly = status === 'completed' && (chunkCount === 0 || chunkCount === null)

  if (isStorageOnly) {
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="warning" title={errorMessage ?? '未提取到文字内容'}>
          仅存储
        </Badge>
        <span className="max-w-[160px] truncate text-xs text-muted-foreground/80" title={errorMessage ?? ''}>
          未建立索引
        </span>
      </div>
    )
  }

  return (
    <Badge
      variant={cfg.variant}
      className={cn(cfg.pulse && 'animate-pulse')}
    >
      {STATUS_LABEL[status]}
    </Badge>
  )
}

const POLL_INTERVAL = 3000

export default function DocumentListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { page, pageSize, total, setTotal, onChange } = usePagination(20)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Document[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await documentsApi.list({
        page,
        page_size: pageSize,
        status: statusFilter || undefined,
        q: search.trim() || undefined,
      })
      setRows(data.items)
      setTotal(data.total)
      return data.items as Document[]
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('documents.loadError')
      toast.error(msg)
      setRows([])
      setTotal(0)
      return []
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, search, setTotal, statusFilter, t])

  // 静默轮询：不触发 loading 状态，避免表格反复闪烁
  const startPoll = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const data = await documentsApi.list({
          page,
          page_size: pageSize,
          status: statusFilter || undefined,
          q: search.trim() || undefined,
        })
        const items = data.items as Document[]
        setRows(items)
        setTotal(data.total)
        const hasInProgress = items.some(
          (r) => r.status === 'pending' || r.status === 'processing',
        )
        if (!hasInProgress) {
          clearInterval(pollRef.current!)
          pollRef.current = null
        }
      } catch {
        // 静默忽略轮询错误
      }
    }, POLL_INTERVAL)
  }, [page, pageSize, search, statusFilter, setTotal])

  useEffect(() => {
    void load().then((items) => {
      const hasInProgress = items.some(
        (r) => r.status === 'pending' || r.status === 'processing',
      )
      if (hasInProgress) startPoll()
    })
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [load, startPoll])

  const handleUploaded = async () => {
    onChange(1, pageSize)
    const items = await load()
    const hasInProgress = items.some(
      (r) => r.status === 'pending' || r.status === 'processing',
    )
    if (hasInProgress) startPoll()
  }

  const handleDownload = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      const { url } = await documentsApi.download(id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(t('documents.downloadFail', 'Download failed'))
      console.error(err)
    }
  }

  const handleReprocess = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      await documentsApi.reprocess(id)
      toast.success(t('documents.reprocessOk', 'Reprocess queued'))
      const items = await load()
      const hasInProgress = items.some(
        (r) => r.status === 'pending' || r.status === 'processing',
      )
      if (hasInProgress) startPoll()
    } catch (err) {
      toast.error(t('documents.reprocessFail', 'Reprocess failed'))
      console.error(err)
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    try {
      await documentsApi.delete(deleteId)
      toast.success(t('documents.deleted', 'Document deleted'))
      await load()
    } catch (e) {
      toast.error(t('documents.deleteFail', 'Delete failed'))
      console.error(e)
    } finally {
      setDeleteId(null)
    }
  }

  const columns = useMemo<ColumnDef<Document>[]>(
    () => [
      {
        accessorKey: 'title',
        header: t('documents.colTitle', 'Title'),
        cell: ({ row }) => (
          <div className="flex max-w-xs items-center gap-2">
            <FileTypeIcon fileType={row.original.file_type} />
            <span className="truncate font-medium text-foreground">{row.original.title}</span>
          </div>
        ),
      },
      {
        accessorKey: 'file_type',
        header: t('documents.colType', '类型'),
        cell: ({ row }) => <FileTypeBadge fileType={row.original.file_type} />,
      },
      {
        id: 'file_format',
        header: t('documents.colFormat', '格式'),
        enableSorting: false,
        cell: ({ row }) => <FileFormatBadge fileType={row.original.file_type} />,
      },
      {
        accessorKey: 'file_size',
        header: t('documents.colSize', 'Size'),
        cell: ({ row }) => formatFileSize(row.original.file_size),
      },
      {
        accessorKey: 'status',
        header: t('documents.colStatus', 'Status'),
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status}
            chunkCount={row.original.chunk_count}
            errorMessage={row.original.error_message}
          />
        ),
      },
      {
        accessorKey: 'chunk_count',
        header: t('documents.colChunks', 'Chunks'),
        cell: ({ row }) => row.original.chunk_count ?? '—',
      },
      {
        accessorKey: 'created_at',
        header: t('documents.colCreated', 'Created'),
        cell: ({ row }) => formatDate(row.original.created_at),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {/* 详情 — 第一位 */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-2"
              title={t('documents.detail', '分块详情')}
              aria-label={t('documents.detail', '分块详情')}
              onClick={() => navigate(`/documents/${row.original.id}`)}
            >
              <LayoutList className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-2"
              title={t('documents.download', '下载文件')}
              aria-label={t('documents.download', '下载文件')}
              onClick={(e) => void handleDownload(e, row.original.id)}
            >
              <Download className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-2"
              title={t('documents.reprocess', '重新处理')}
              aria-label={t('documents.reprocess', '重新处理')}
              onClick={(e) => void handleReprocess(e, row.original.id)}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="px-2"
              title={t('common.delete', '删除')}
              aria-label={t('common.delete', '删除')}
              onClick={() => setDeleteId(row.original.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
      },
    ],
    [t, navigate],
  )

  return (
    <PageContainer size="xl">
      <PageHeader
        title={t('document.title', '文档')}
        description={t(
          'documents.subtitle',
          'Upload, process, and manage knowledge documents.',
        )}
        icon={FolderOpen}
        iconAccent="article"
        breadcrumbs={[{ label: '资产管理' }, { label: '媒体' }, { label: t('document.title', '文档') }]}
        actions={
          <Button type="button" variant="primary" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4" />
            {t('documents.upload', 'Upload')}
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        onRowClick={(row) => setPreviewDoc(row)}
        pagination={{
          page,
          pageSize,
          total,
          onChange,
        }}
        toolbar={
          <>
            <Select
              className="w-44 min-w-[11rem]"
              value={statusFilter}
              onChange={(val) => {
                onChange(1, pageSize)
                setStatusFilter(val)
              }}
              options={[
                { value: '', label: t('documents.allStatuses', 'All statuses') },
                { value: 'pending', label: t('documents.status.pending', 'Pending') },
                { value: 'processing', label: t('documents.status.processing', 'Processing') },
                { value: 'completed', label: t('documents.status.completed', 'Completed') },
                { value: 'failed', label: t('documents.status.failed', 'Failed') },
              ]}
            />
            <div className="min-w-[200px] max-w-md flex-1">
              <SearchInput
                value={search}
                onChange={(v) => {
                  onChange(1, pageSize)
                  setSearch(v)
                }}
                placeholder={t('documents.searchPlaceholder', 'Search by title…')}
                className="w-full"
              />
            </div>
          </>
        }
        emptyText={t('documents.empty', 'No documents yet')}
      />

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title={t('documents.uploadTitle', 'Upload document')}
        size="lg"
      >
        <BatchUploadPanel
          accept={ACCEPT}
          maxSize={50 * 1024 * 1024}
          hint="支持批量上传，单次最多 20 个文件，上传后自动解析并建立语义索引"
          uploadOne={(file) => documentsApi.upload(file, { title: file.name.replace(/\.[^.]+$/, '') })}
          onUploaded={() => void handleUploaded()}
          onClose={() => setUploadOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        open={deleteId != null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
        title={t('documents.confirmDeleteTitle', 'Delete document?')}
        message={t('documents.confirmDeleteBody', 'This cannot be undone.')}
        variant="danger"
        confirmText={t('common.delete', 'Delete')}
      />

      {previewDoc && (
        <PreviewLoader
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </PageContainer>
  )
}

/** Fetches the signed download URL then renders DocumentPreview */
function PreviewLoader({ doc, onClose }: { doc: Document; onClose: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    documentsApi.download(doc.id)
      .then(({ url }) => setPreviewUrl(url))
      .catch(() => {
        // If download URL fails, try using file_path directly
        setPreviewUrl(doc.file_path)
      })
  }, [doc.id, doc.file_path])

  if (!previewUrl) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center glass-overlay">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>,
      document.body,
    )
  }

  return (
    <DocumentPreview
      url={previewUrl}
      fileName={doc.file_name}
      fileType={doc.file_type || undefined}
      title={doc.title}
      onClose={onClose}
    />
  )
}
