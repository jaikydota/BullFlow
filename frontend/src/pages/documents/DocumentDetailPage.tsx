import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  HardDrive,
  Layers,
  Loader2,
  Pencil,
  RefreshCw,
  Tag,
  XCircle,
} from 'lucide-react'
import { documentsApi } from '@/api/documents'
import type { Document } from '@/types/document'
import { Button } from '@/components/common/Button'
import { Badge } from '@/components/common/Badge'
import { Modal } from '@/components/common/Modal'
import { Input } from '@/components/common/Input'
import { FormField } from '@/components/form/FormField'
import { TagInput } from '@/components/form/TagInput'
import { ChunkViewer } from '@/components/knowledge/ChunkViewer'
import { toast } from '@/components/common/Toast'
import { IconBox, PageContainer, SectionCard } from '@/components/shared'
import { formatDate, formatFileSize } from '@/utils/format'
import { cn } from '@/utils/helpers'

/* ── Status badge ── */
function StatusBadge({ status }: { status: Document['status'] }) {
  const map: Record<Document['status'], { variant: 'warning' | 'success' | 'danger'; Icon: typeof Clock }> = {
    pending:    { variant: 'warning', Icon: Clock },
    processing: { variant: 'warning', Icon: Loader2 },
    completed:  { variant: 'success', Icon: CheckCircle2 },
    failed:     { variant: 'danger',  Icon: XCircle },
  }
  const STATUS_LABEL: Record<Document['status'], string> = {
    pending: '待处理', processing: '处理中', completed: '已完成', failed: '处理失败',
  }
  const { variant, Icon } = map[status]
  return (
    <Badge variant={variant} className={cn('gap-1.5', status === 'processing' && 'animate-pulse')}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {STATUS_LABEL[status]}
    </Badge>
  )
}

/* ── Meta item ── */
function MetaRow({ icon: Icon, label, children }: { icon: typeof FileText; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
        <Icon className="size-4 text-muted-foreground" strokeWidth={2.1} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">{label}</p>
        <div className="text-sm font-medium text-foreground">{children}</div>
      </div>
    </div>
  )
}

export default function DocumentDetailPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const d = await documentsApi.get(id)
      setDoc(d)
      setTitle(d.title)
      setCategory(d.category ?? '')
      setTags(d.tags ?? [])
    } catch (e) {
      toast.error(t('documents.loadOneError', 'Failed to load document'))
      console.error(e)
      setDoc(null)
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => { void load() }, [load])

  const saveMeta = async () => {
    if (!id) return
    setSaving(true)
    try {
      await documentsApi.update(id, { title, category: category || null, tags })
      toast.success(t('documents.saved', 'Saved'))
      setEditOpen(false)
      await load()
    } catch (e) {
      toast.error(t('documents.saveFail', 'Save failed'))
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  /* ── Loading / not found ── */
  if (loading && !doc) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin text-primary" />
        <span className="text-sm">{t('common.loading', 'Loading…')}</span>
      </div>
    )
  }

  if (!doc) {
    return (
      <PageContainer size="md">
        <div className="py-20 text-center">
          <FileText className="mx-auto mb-4 size-12 text-muted-foreground/40" strokeWidth={1.8} />
          <p className="mb-4 text-muted-foreground">{t('documents.notFound', 'Document not found.')}</p>
          <Link
            to="/documents"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="size-4" />
            {t('documents.backToList', 'Back to documents')}
          </Link>
        </div>
      </PageContainer>
    )
  }

  const fileExt = doc.file_name.split('.').pop()?.toUpperCase() ?? ''

  return (
    <PageContainer size="lg">
      {/* ── Top bar ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/documents')}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t('documents.back', '返回文档列表')}
        </button>

        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            {t('common.edit', '编辑信息')}
          </Button>
        </div>
      </div>

      {/* ── Page header ── */}
      <div className="mb-6 flex items-start gap-4">
        <IconBox icon={FileText} accent="article" size="xl" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
              {doc.title}
            </h1>
            {fileExt && (
              <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {fileExt}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{doc.file_name}</p>
        </div>
        <div className="shrink-0">
          <StatusBadge status={doc.status} />
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start">
        {/* ── Left: metadata panel ── */}
        <aside className="space-y-2 lg:sticky lg:top-4">
          <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground/80">
            {t('documents.fileInfo', '文件信息')}
          </h2>

          <MetaRow icon={HardDrive} label={t('documents.fileSize', '文件大小')}>
            {formatFileSize(doc.file_size)}
          </MetaRow>

          <MetaRow icon={Layers} label={t('documents.colChunks', '分块数量')}>
            {doc.chunk_count != null ? (
              <span>
                {doc.chunk_count}{' '}
                <span className="font-normal text-muted-foreground">个分块</span>
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </MetaRow>

          <MetaRow icon={Tag} label={t('documents.category', '分类')}>
            {doc.category ? <span>{doc.category}</span> : <span className="text-muted-foreground">—</span>}
          </MetaRow>

          <MetaRow icon={CalendarDays} label={t('documents.created', '创建时间')}>
            {formatDate(doc.created_at)}
          </MetaRow>

          <MetaRow icon={RefreshCw} label={t('documents.updated', '更新时间')}>
            {formatDate(doc.updated_at)}
          </MetaRow>

          {/* Tags */}
          {doc.tags && doc.tags.length > 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                {t('documents.tags', '标签')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {doc.tags.map((tag) => (
                  <Badge key={tag} variant="default" size="sm">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {doc.error_message && (
            <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-destructive/80">
                错误信息
              </p>
              <p className="text-sm leading-relaxed text-destructive">{doc.error_message}</p>
            </div>
          )}
        </aside>

        {/* ── Right: chunk viewer ── */}
        <SectionCard variant="elevated" title="分块详情" icon={Layers} iconAccent="article">
          <ChunkViewer documentId={id} />
        </SectionCard>
      </div>

      {/* ── Edit modal ── */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={t('documents.editMeta', '编辑文档信息')}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
              {t('common.cancel', '取消')}
            </Button>
            <Button type="button" variant="primary" loading={saving} onClick={() => void saveMeta()}>
              {t('common.save', '保存')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <FormField label={t('documents.colTitle', '标题')}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <FormField label={t('documents.category', '分类')}>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="—" />
          </FormField>
          <FormField label={t('documents.tags', '标签')}>
            <TagInput value={tags} onChange={setTags} placeholder={t('documents.addTag', '添加标签')} />
          </FormField>
        </div>
      </Modal>
    </PageContainer>
  )
}
