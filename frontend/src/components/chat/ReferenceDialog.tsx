import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Briefcase,
  Building,
  Building2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Package,
  Search,
  UserCircle,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared'
import { documentsApi } from '@/api/documents'
import { imagesApi } from '@/api/images'
import { brandsApi } from '@/api/brands'
import { productsApi } from '@/api/products'
import { companiesApi } from '@/api/companies'
import { customersApi } from '@/api/customers'
import { casesApi } from '@/api/cases'
import type { Document as Doc } from '@/types/document'
import type { Brand } from '@/types/brand'
import type { Product } from '@/types/product'
import { toast } from '@/components/common/Toast'
import { cn } from '@/lib/utils'
import {
  MAX_REFS,
  refKey,
  type SelectedReference,
} from '@/pages/chat/composerUtils'

type RefTab = 'document' | 'image' | 'brand' | 'product' | 'company' | 'customer' | 'case'

type ImageItem = {
  id: string
  title?: string
  file_name?: string
  file_path?: string
  thumbnail_path?: string
}

const PAGE_SIZE = 30

export type ReferenceDialogProps = {
  open: boolean
  onClose: () => void
  selected: SelectedReference[]
  onConfirm: (refs: SelectedReference[]) => void
  initialTab?: RefTab
  /** 隐藏指定 Tab（如快速模式下隐藏 document） */
  hideTabs?: RefTab[]
  /** 弹窗标题（默认「挂载参考素材」；生成页传「选择参考内容」） */
  title?: string
  /** 弹窗描述 */
  description?: string
  /** 文档最多可选数量（生成页自定义模式限 2；不传则不单独限制） */
  maxDocuments?: number
}

const ALL_TABS: RefTab[] = ['document', 'image', 'brand', 'product', 'company', 'customer', 'case']

export function ReferenceDialog({
  open,
  onClose,
  selected,
  onConfirm,
  initialTab = 'document',
  hideTabs,
  title = '挂载参考素材',
  description,
  maxDocuments,
}: ReferenceDialogProps) {
  const hiddenSet = useMemo(() => new Set(hideTabs ?? []), [hideTabs])
  const visibleTabs = useMemo(() => ALL_TABS.filter((t) => !hiddenSet.has(t)), [hiddenSet])
  const safeInitialTab: RefTab = hiddenSet.has(initialTab)
    ? (visibleTabs[0] ?? 'image')
    : initialTab

  const [tab, setTab] = useState<RefTab>(safeInitialTab)
  const [draft, setDraft] = useState<SelectedReference[]>(selected)

  useEffect(() => {
    if (open) {
      setTab(safeInitialTab)
      setDraft(selected)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, safeInitialTab])

  const draftKeys = useMemo(() => new Set(draft.map((r) => refKey(r))), [draft])

  const toggle = useCallback(
    (r: SelectedReference) => {
      const k = refKey(r)
      if (draftKeys.has(k)) {
        setDraft((prev) => prev.filter((x) => refKey(x) !== k))
        return
      }
      if (r.kind === 'document' && maxDocuments != null) {
        const docCount = draft.filter((x) => x.kind === 'document').length
        if (docCount >= maxDocuments) {
          toast.error(`最多选 ${maxDocuments} 个文档`)
          return
        }
      }
      if (draft.length >= MAX_REFS) {
        toast.error(`最多挂载 ${MAX_REFS} 个素材`)
        return
      }
      setDraft((prev) => [...prev, r])
    },
    [draft, draftKeys, maxDocuments],
  )

  const remove = useCallback((k: string) => {
    setDraft((prev) => prev.filter((x) => refKey(x) !== k))
  }, [])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <DialogTitle className="text-base">{title}</DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                {description ?? `选择文档、图片、品牌或产品，AI 创作时会优先参考。最多 ${MAX_REFS} 个。`}
              </DialogDescription>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'shrink-0 self-end border-primary/30 bg-primary/10 text-primary',
                draft.length === 0 && 'border-border bg-muted text-muted-foreground',
              )}
            >
              已选 {draft.length}/{MAX_REFS}
            </Badge>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as RefTab)} className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="shrink-0 border-b border-border px-6 py-3">
            <TabsList
              className="grid w-full"
              style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}
            >
              {!hiddenSet.has('document') && (
                <TabsTrigger value="document"><FileText className="size-3.5" />文档</TabsTrigger>
              )}
              {!hiddenSet.has('image') && (
                <TabsTrigger value="image"><ImageIcon className="size-3.5" />图片</TabsTrigger>
              )}
              {!hiddenSet.has('brand') && (
                <TabsTrigger value="brand"><Building2 className="size-3.5" />品牌</TabsTrigger>
              )}
              {!hiddenSet.has('product') && (
                <TabsTrigger value="product"><Package className="size-3.5" />产品</TabsTrigger>
              )}
              {!hiddenSet.has('company') && (
                <TabsTrigger value="company"><Building className="size-3.5" />公司</TabsTrigger>
              )}
              {!hiddenSet.has('customer') && (
                <TabsTrigger value="customer"><UserCircle className="size-3.5" />客户</TabsTrigger>
              )}
              {!hiddenSet.has('case') && (
                <TabsTrigger value="case"><Briefcase className="size-3.5" />案例</TabsTrigger>
              )}
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {!hiddenSet.has('document') && (
              <TabsContent value="document" className="mt-0">
                {tab === 'document' && <DocumentRefTab draftKeys={draftKeys} onToggle={toggle} />}
              </TabsContent>
            )}
            {!hiddenSet.has('image') && (
              <TabsContent value="image" className="mt-0">
                {tab === 'image' && <ImageRefTab draftKeys={draftKeys} onToggle={toggle} />}
              </TabsContent>
            )}
            {!hiddenSet.has('brand') && (
              <TabsContent value="brand" className="mt-0">
                {tab === 'brand' && <BrandRefTab draftKeys={draftKeys} onToggle={toggle} />}
              </TabsContent>
            )}
            {!hiddenSet.has('product') && (
              <TabsContent value="product" className="mt-0">
                {tab === 'product' && <ProductRefTab draftKeys={draftKeys} onToggle={toggle} />}
              </TabsContent>
            )}
            {!hiddenSet.has('company') && (
              <TabsContent value="company" className="mt-0">
                {tab === 'company' && <CompanyRefTab draftKeys={draftKeys} onToggle={toggle} />}
              </TabsContent>
            )}
            {!hiddenSet.has('customer') && (
              <TabsContent value="customer" className="mt-0">
                {tab === 'customer' && <CustomerRefTab draftKeys={draftKeys} onToggle={toggle} />}
              </TabsContent>
            )}
            {!hiddenSet.has('case') && (
              <TabsContent value="case" className="mt-0">
                {tab === 'case' && <CaseRefTab draftKeys={draftKeys} onToggle={toggle} />}
              </TabsContent>
            )}
          </div>
        </Tabs>

        {/* 选中预览条 + 操作 */}
        {draft.length > 0 && (
          <div className="shrink-0 border-t border-border bg-muted/40 px-6 py-3">
            <div className="flex flex-wrap gap-1.5">
              {draft.map((r) => (
                <span
                  key={refKey(r)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground"
                >
                  {refIconNode(r.kind)}
                  <span className="max-w-[12rem] truncate">{refLabelOf(r)}</span>
                  <button
                    type="button"
                    onClick={() => remove(refKey(r))}
                    className="-mr-1 inline-flex size-4 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="移除"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0 border-t border-border px-6 py-3">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button
            type="button"
            onClick={() => {
              onConfirm(draft)
              onClose()
            }}
          >
            确认 {draft.length > 0 ? `(${draft.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function refLabelOf(r: SelectedReference): string {
  switch (r.kind) {
    case 'document': return r.title
    case 'image': return r.title || '图片'
    case 'brand': return r.name
    case 'product': return r.name
    case 'company': return r.name
    case 'customer': return r.name
    case 'case': return r.title
  }
}

const REF_ICONS: Record<SelectedReference['kind'], typeof Building2> = {
  document: FileText,
  image: ImageIcon,
  brand: Building2,
  product: Package,
  company: Building,
  customer: UserCircle,
  case: Briefcase,
}

// 各维度图标配色（顶部 Tab + 底部选中条共用）：
// 文档=文档蓝、图片=图片绿、品牌/产品/公司/客户/案例=info 天蓝
const KIND_COLOR: Record<SelectedReference['kind'], string> = {
  document: 'text-content-article',
  image: 'text-content-image',
  brand: 'text-sky-600 dark:text-sky-400',
  product: 'text-sky-600 dark:text-sky-400',
  company: 'text-sky-600 dark:text-sky-400',
  customer: 'text-sky-600 dark:text-sky-400',
  case: 'text-sky-600 dark:text-sky-400',
}

function refIconNode(kind: SelectedReference['kind']) {
  const Icon = REF_ICONS[kind] ?? Package
  return <Icon className={cn('size-3', KIND_COLOR[kind])} strokeWidth={2.25} aria-hidden />
}

// ─── 子 Tab 组件 ───────────────────────────────────────────────

type TabChildProps = {
  draftKeys: Set<string>
  onToggle: (r: SelectedReference) => void
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  )
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-10 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      <span className="ml-2 text-sm">加载中...</span>
    </div>
  )
}

function DocumentRefTab({ draftKeys, onToggle }: TabChildProps) {
  const [items, setItems] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    documentsApi
      .list({ page: 1, page_size: PAGE_SIZE, status: 'completed' })
      .then((res) => { if (!cancelled) setItems(res.items ?? []) })
      .catch(() => { if (!cancelled) toast.error('加载文档列表失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((d) => d.title?.toLowerCase().includes(needle) || d.file_name?.toLowerCase().includes(needle))
  }, [items, q])

  return (
    <div className="space-y-3">
      <SearchBar value={q} onChange={setQ} placeholder="搜索文档标题或文件名..." />
      {loading ? (
        <LoadingRow />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="暂无文档"
          description="去 /documents 上传你的知识库文档后再来挂载"
        />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((d) => {
            const docRef: SelectedReference = { kind: 'document', id: d.id, title: d.title || d.file_name, fileType: d.file_type }
            const active = draftKeys.has(refKey(docRef))
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onToggle(docRef)}
                className={cn(
                  'flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-all',
                  active
                    ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border bg-card hover:border-primary/30 hover:bg-muted/40',
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-content-article/10 text-content-article">
                  <FileText className="size-4" strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {d.title || d.file_name}
                    </div>
                    <Badge variant="outline" className="shrink-0 border-border bg-muted/40 text-[10px] uppercase">
                      {d.file_type}
                    </Badge>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {d.file_name} · {d.chunk_count ?? 0} 片段
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ImageRefTab({ draftKeys, onToggle }: TabChildProps) {
  const [items, setItems] = useState<ImageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    imagesApi
      .list({ page: 1, page_size: PAGE_SIZE })
      .then((res) => { if (!cancelled) setItems((res.items ?? []) as ImageItem[]) })
      .catch(() => { if (!cancelled) toast.error('加载图片列表失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((i) => (i.title || i.file_name || '').toLowerCase().includes(needle))
  }, [items, q])

  return (
    <div className="space-y-3">
      <SearchBar value={q} onChange={setQ} placeholder="搜索图片标题..." />
      {loading ? (
        <LoadingRow />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="暂无图片"
          description="去 /media/images 上传图片素材后再来挂载"
        />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((img) => {
            const url = imageUrl(img)
            const ref: SelectedReference = {
              kind: 'image',
              id: img.id,
              url,
              title: img.title || img.file_name,
            }
            const active = draftKeys.has(refKey(ref))
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => onToggle(ref)}
                className={cn(
                  'group relative aspect-square cursor-pointer overflow-hidden rounded-xl border-2 bg-muted transition-all',
                  active
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-border hover:border-primary/30',
                )}
              >
                {url ? (
                  <img src={url} alt={img.title || ''} className="size-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="size-6" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[11px] text-white">
                  {img.title || img.file_name || '未命名'}
                </div>
                {active && (
                  <div className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    ✓
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function imageUrl(img: ImageItem): string {
  // 后端在 list 时会将 file_path 转成公网 URL（path_to_url）；此处直接信任
  return (img as { file_url?: string }).file_url
    ?? (img as { thumbnail_url?: string }).thumbnail_url
    ?? img.thumbnail_path
    ?? img.file_path
    ?? ''
}

function BrandRefTab({ draftKeys, onToggle }: TabChildProps) {
  const [items, setItems] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    brandsApi
      .list({ page: 1, page_size: 50 })
      .then((res) => { if (!cancelled) setItems(res.items ?? []) })
      .catch(() => { if (!cancelled) toast.error('加载品牌列表失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((b) => b.name?.toLowerCase().includes(needle) || b.slogan?.toLowerCase().includes(needle))
  }, [items, q])

  return (
    <div className="space-y-3">
      <SearchBar value={q} onChange={setQ} placeholder="搜索品牌名称或口号..." />
      {loading ? (
        <LoadingRow />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="暂无品牌"
          description="去 /knowledge/brand 创建品牌后再来挂载"
        />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((b) => {
            const ref: SelectedReference = { kind: 'brand', id: b.id, name: b.name }
            const active = draftKeys.has(refKey(ref))
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onToggle(ref)}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 bg-card p-3 transition-all',
                  active
                    ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
                    : 'border-border hover:border-primary/30 hover:bg-muted/40',
                )}
                style={b.brand_color ? { '--brand-color': b.brand_color } as React.CSSProperties : undefined}
              >
                {b.logo_url ? (
                  <img src={b.logo_url} alt={b.name} className="size-12 rounded-full object-cover" />
                ) : (
                  <div
                    className="flex size-12 items-center justify-center rounded-full text-lg font-semibold text-primary-foreground"
                    style={{ background: b.brand_color || 'oklch(var(--primary))' }}
                  >
                    {b.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="line-clamp-1 text-sm font-medium text-foreground">{b.name}</div>
                {b.slogan && (
                  <div className="line-clamp-1 text-[11px] text-muted-foreground">{b.slogan}</div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ProductRefTab({ draftKeys, onToggle }: TabChildProps) {
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    productsApi
      .list({ page: 1, page_size: 50 })
      .then((res) => { if (!cancelled) setItems(res.items ?? []) })
      .catch(() => { if (!cancelled) toast.error('加载产品列表失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((p) => p.name?.toLowerCase().includes(needle) || p.category?.toLowerCase().includes(needle))
  }, [items, q])

  return (
    <div className="space-y-3">
      <SearchBar value={q} onChange={setQ} placeholder="搜索产品名称或分类..." />
      {loading ? (
        <LoadingRow />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="暂无产品"
          description="去 /knowledge/product 创建产品后再来挂载"
        />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((p) => {
            const ref: SelectedReference = { kind: 'product', id: p.id, name: p.name }
            const active = draftKeys.has(refKey(ref))
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onToggle(ref)}
                className={cn(
                  'group flex cursor-pointer flex-col gap-2 overflow-hidden rounded-xl border-2 bg-card p-2 text-left transition-all',
                  active
                    ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
                    : 'border-border hover:border-primary/30 hover:bg-muted/40',
                )}
              >
                <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
                  {p.cover_image ? (
                    <img src={p.cover_image} alt={p.name} className="size-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <Package className="size-6" />
                    </div>
                  )}
                </div>
                <div className="px-1">
                  <div className="line-clamp-1 text-sm font-medium text-foreground">{p.name}</div>
                  {p.category && (
                    <div className="line-clamp-1 text-[11px] text-muted-foreground">{p.category}</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── 公司 / 客户 / 案例：统一用简洁列表 Tab ───────────────────────

type SimpleRow = { id: string; label: string; sub?: string }

function rowsOf(items: unknown): Record<string, unknown>[] {
  return (items ?? []) as unknown as Record<string, unknown>[]
}

function SimpleRefTab({
  draftKeys, onToggle, icon: Icon, placeholder, emptyTitle, emptyDesc, load, buildRef,
}: TabChildProps & {
  icon: typeof Building
  placeholder: string
  emptyTitle: string
  emptyDesc: string
  load: () => Promise<SimpleRow[]>
  buildRef: (row: SimpleRow) => SelectedReference
}) {
  const [items, setItems] = useState<SimpleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    load()
      .then((rows) => { if (!cancelled) setItems(rows) })
      .catch(() => { if (!cancelled) toast.error('加载列表失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((i) => i.label.toLowerCase().includes(needle) || (i.sub ?? '').toLowerCase().includes(needle))
  }, [items, q])

  return (
    <div className="space-y-3">
      <SearchBar value={q} onChange={setQ} placeholder={placeholder} />
      {loading ? (
        <LoadingRow />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Icon} title={emptyTitle} description={emptyDesc} />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((row) => {
            const ref = buildRef(row)
            const active = draftKeys.has(refKey(ref))
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onToggle(ref)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-all',
                  active ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card hover:border-primary/30 hover:bg-muted/40',
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <Icon className="size-4" strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{row.label}</div>
                  {row.sub && <div className="truncate text-[11px] text-muted-foreground">{row.sub}</div>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CompanyRefTab(p: TabChildProps) {
  return (
    <SimpleRefTab
      {...p}
      icon={Building}
      placeholder="搜索公司名称..."
      emptyTitle="暂无公司"
      emptyDesc="去 资产管理 - 公司信息 - 公司 录入后再来挂载"
      load={async () => rowsOf((await companiesApi.list({ page: 1, page_size: 50 })).items).map(
        (c) => ({ id: String(c.id), label: String(c.name ?? '未命名'), sub: (c.industry as string) || undefined }),
      )}
      buildRef={(row) => ({ kind: 'company', id: row.id, name: row.label })}
    />
  )
}

function CustomerRefTab(p: TabChildProps) {
  return (
    <SimpleRefTab
      {...p}
      icon={UserCircle}
      placeholder="搜索客户名称..."
      emptyTitle="暂无客户"
      emptyDesc="去 资产管理 - 公司信息 - 客户 录入后再来挂载"
      load={async () => rowsOf((await customersApi.list({ page: 1, page_size: 50 })).items).map(
        (c) => ({ id: String(c.id), label: String(c.name ?? '未命名'), sub: (c.company_name as string) || undefined }),
      )}
      buildRef={(row) => ({ kind: 'customer', id: row.id, name: row.label })}
    />
  )
}

function CaseRefTab(p: TabChildProps) {
  return (
    <SimpleRefTab
      {...p}
      icon={Briefcase}
      placeholder="搜索案例标题..."
      emptyTitle="暂无案例"
      emptyDesc="去 资产管理 - 公司信息 - 案例 录入后再来挂载"
      load={async () => rowsOf((await casesApi.list({ page: 1, page_size: 50 })).items).map(
        (c) => ({ id: String(c.id), label: String(c.title ?? '未命名'), sub: (c.category as string) || undefined }),
      )}
      buildRef={(row) => ({ kind: 'case', id: row.id, title: row.label })}
    />
  )
}
