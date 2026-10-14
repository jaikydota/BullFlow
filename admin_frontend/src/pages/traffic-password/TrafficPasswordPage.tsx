import * as React from 'react'
import {
  ExternalLink,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  EmptyState,
  PageContainer,
  PageHeader,
  SectionCard,
} from '@/components/shared'
import {
  DetailDrawer,
  ImageUploadField,
  type ImageUploadFieldRef,
  NumberInput,
  ProForm,
  ProFormField,
} from '@/components/admin'
import { cn } from '@/lib/utils'
import { ApiBusinessError } from '@/lib/api/schema'
import {
  createTrafficSecret,
  deleteTrafficSecret,
  fetchTrafficSecrets,
  toggleTrafficSecret,
  updateTrafficSecret,
  type TrafficSecretFromApi,
  type TrafficSecretUpsertBody,
} from '@/lib/api/traffic-secrets'

type DraftItem = {
  id: string | null
  title: string
  icon: string
  iconUrl: string
  description: string
  tagsText: string
  rating: string
  category: string
  source: 'company' | 'partner' | ''
  priceStatus: 'free' | 'trial' | 'subscription' | 'in-app' | ''
  contentMarkdown: string
  url: string
  sortOrder: number
  isEnabled: boolean
}

const PRICE_OPTIONS = [
  { value: 'free', label: '免费' },
  { value: 'trial', label: '试用' },
  { value: 'subscription', label: '订阅' },
  { value: 'in-app', label: '内购' },
] as const

function emptyDraft(): DraftItem {
  return {
    id: null,
    title: '',
    icon: '',
    iconUrl: '',
    description: '',
    tagsText: '',
    rating: '',
    category: '',
    source: '',
    priceStatus: '',
    contentMarkdown: '',
    url: '',
    sortOrder: 0,
    isEnabled: true,
  }
}

function rowToDraft(row: TrafficSecretFromApi): DraftItem {
  return {
    id: row.id,
    title: row.title ?? '',
    icon: row.icon ?? '',
    iconUrl: row.iconUrl ?? '',
    description: row.description ?? '',
    tagsText: (row.tags ?? []).join(', '),
    rating: row.rating == null ? '' : String(row.rating),
    category: row.category ?? '',
    source: (row.source as DraftItem['source']) ?? '',
    priceStatus: (row.priceStatus as DraftItem['priceStatus']) ?? '',
    contentMarkdown: row.contentMarkdown ?? '',
    url: row.url ?? '',
    sortOrder: row.sortOrder ?? 0,
    isEnabled: row.isEnabled ?? true,
  }
}

function draftToPayload(draft: DraftItem): TrafficSecretUpsertBody {
  const tags = draft.tagsText
    .split(/[,，;；\n]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  const ratingNum = draft.rating.trim() ? Number(draft.rating) : null
  return {
    title: draft.title.trim(),
    icon: draft.icon.trim() || null,
    icon_url: draft.iconUrl.trim() || null,
    description: draft.description.trim() || null,
    tags,
    rating: Number.isFinite(ratingNum as number) ? (ratingNum as number) : null,
    category: draft.category.trim() || null,
    source: draft.source || null,
    price_status: draft.priceStatus || null,
    content_markdown: draft.contentMarkdown || null,
    url: draft.url.trim(),
    sort_order: Number.isFinite(Number(draft.sortOrder))
      ? Math.floor(Number(draft.sortOrder))
      : 0,
    is_enabled: draft.isEnabled,
  }
}

export default function TrafficPasswordPage() {
  const [items, setItems] = React.useState<TrafficSecretFromApi[]>([])
  const [loading, setLoading] = React.useState(true)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<DraftItem | null>(null)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const iconUploadRef = React.useRef<ImageUploadFieldRef>(null)

  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchTrafficSecrets()
      setItems(rows)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('加载流量密码失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const handleAdd = () => {
    setEditingId(null)
    setDraft(emptyDraft())
    setDrawerOpen(true)
  }

  const handleEdit = (row: TrafficSecretFromApi) => {
    setEditingId(row.id)
    setDraft(rowToDraft(row))
    setDrawerOpen(true)
  }

  const updateDraft = (patch: Partial<DraftItem>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))

  const handleSave = async () => {
    if (!draft) return
    if (!draft.title.trim()) return toast.error('请填写标题')
    if (!draft.url.trim()) return toast.error('请填写跳转 URL')
    setSaving(true)
    try {
      let finalIconUrl = draft.iconUrl
      if (iconUploadRef.current?.isPending()) {
        try {
          const uploaded = await iconUploadRef.current.commit()
          finalIconUrl = uploaded ?? draft.iconUrl
        } catch {
          toast.error('图片上传失败')
          setSaving(false)
          return
        }
      }
      const payload = draftToPayload({ ...draft, iconUrl: finalIconUrl })
      // 用接口返回值直接更新本地数组，不依赖二次 GET
      if (editingId) {
        const saved = await updateTrafficSecret(editingId, payload)
        setItems((prev) => prev.map((r) => (r.id === editingId ? saved : r)))
        toast.success('已更新')
      } else {
        const created = await createTrafficSecret(payload)
        setItems((prev) => [...prev, created])
        toast.success('已创建')
      }
      setDrawerOpen(false)
      setDraft(null)
      setEditingId(null)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (row: TrafficSecretFromApi) => {
    try {
      const saved = await toggleTrafficSecret(row.id, !row.isEnabled)
      setItems((prev) => prev.map((r) => (r.id === row.id ? saved : r)))
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('切换状态失败')
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    setDeleting(true)
    try {
      await deleteTrafficSecret(deletingId)
      setItems((prev) => prev.filter((r) => r.id !== deletingId))
      toast.success('已删除')
      setDeletingId(null)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('删除失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="流量密码"
        description="维护 C 端浮窗里展示的导流产品。支持启停、排序、Markdown 详情与跳转 URL"
        icon={KeyRound}
        iconAccent="warning"
        breadcrumbs={[{ label: '资源运维' }, { label: '流量密码' }]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              className="gap-1.5"
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
              ) : (
                <RefreshCw className="size-3.5" strokeWidth={2.25} />
              )}
              刷新
            </Button>
            <Button size="sm" onClick={handleAdd}>
              <Plus className="size-3.5" strokeWidth={2.25} />
              新建
            </Button>
          </>
        }
      />

      {loading ? (
        <SectionCard>
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" strokeWidth={2.25} />
            加载中…
          </div>
        </SectionCard>
      ) : items.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={KeyRound}
            title="暂无数据"
            description='点击右上角"新建"添加第一条流量密码'
            action={
              <Button onClick={handleAdd}>
                <Plus className="size-4" strokeWidth={2.25} />
                新建
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((row) => (
            <div
              key={row.id}
              className={cn(
                'card-hover rounded-xl border border-border bg-card p-4',
                !row.isEnabled && 'opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30 text-xl">
                    {row.iconUrl ? (
                      <img
                        src={row.iconUrl}
                        alt={row.title}
                        className="size-full rounded-lg object-cover"
                      />
                    ) : (
                      <span>{row.icon || '🎯'}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold leading-tight text-foreground">
                      {row.title}
                    </h3>
                    {row.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {row.description}
                      </p>
                    )}
                  </div>
                </div>
                <Badge
                  className={cn(
                    'shrink-0',
                    row.isEnabled
                      ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300'
                      : 'bg-muted text-muted-foreground hover:bg-muted',
                  )}
                >
                  {row.isEnabled ? '启用' : '禁用'}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {row.rating != null && (
                  <span className="inline-flex items-center gap-0.5 text-amber-500">
                    <Star className="size-3.5 fill-amber-500" strokeWidth={2.25} />
                    {row.rating.toFixed(1)}
                  </span>
                )}
                {row.category && <Badge variant="secondary">{row.category}</Badge>}
                {row.source && (
                  <Badge variant="outline">{row.source === 'company' ? '自研' : '合作'}</Badge>
                )}
                {row.priceStatus && (
                  <Badge variant="outline">
                    {PRICE_OPTIONS.find((p) => p.value === row.priceStatus)?.label ?? row.priceStatus}
                  </Badge>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  sort {row.sortOrder}
                </span>
              </div>

              {row.tags && row.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {row.tags.slice(0, 6).map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px] font-normal">
                      #{t}
                    </Badge>
                  ))}
                </div>
              )}

              <a
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline"
              >
                <ExternalLink className="size-3 shrink-0" strokeWidth={2.25} />
                <span className="truncate">{row.url}</span>
              </a>

              <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3">
                <div className="flex items-center gap-2">
                  <Switch checked={row.isEnabled} onCheckedChange={() => handleToggle(row)} />
                  <span className="text-xs text-muted-foreground">
                    {row.isEnabled ? '已启用' : '已禁用'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(row)}>
                    <Pencil className="size-3.5" strokeWidth={2.25} />
                    编辑
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeletingId(row.id)}
                  >
                    <Trash2 className="size-3.5" strokeWidth={2.25} />
                    删除
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 编辑 Drawer */}
      <DetailDrawer
        open={drawerOpen}
        onOpenChange={(o) => !saving && setDrawerOpen(o)}
        title={editingId ? '编辑流量密码' : '新建流量密码'}
        description="所有字段最终落到 traffic_secrets 表；C 端按 sort_order 升序展示启用项"
        width="lg"
        padded={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              保存
            </Button>
          </div>
        }
      >
        {draft && (
          <ProForm layout="2-col" className="p-5">
            <ProFormField label="标题" required fullWidth>
              <Input
                value={draft.title}
                onChange={(e) => updateDraft({ title: e.target.value })}
                placeholder="例：AI 写作助手 Pro"
              />
            </ProFormField>
            <ProFormField label="图标 emoji" hint="图片优先级高于 emoji">
              <Input
                value={draft.icon}
                onChange={(e) => updateDraft({ icon: e.target.value })}
                placeholder="🎯"
              />
            </ProFormField>
            <ProFormField label="图标图片" hint="选择文件后将在「保存」时上传到 MinIO">
              <ImageUploadField
                ref={iconUploadRef}
                mode="deferred"
                value={draft.iconUrl}
                onChange={(iconUrl) => updateDraft({ iconUrl: iconUrl ?? '' })}
                width={120}
                height={120}
                hint="PNG / WebP ≤ 10MB"
              />
            </ProFormField>
            <ProFormField label="一句话描述" fullWidth>
              <Input
                value={draft.description}
                onChange={(e) => updateDraft({ description: e.target.value })}
                placeholder="智能文案生成，一键爆款内容"
                maxLength={512}
              />
            </ProFormField>
            <ProFormField label="标签" hint="多个用逗号分隔" fullWidth>
              <Input
                value={draft.tagsText}
                onChange={(e) => updateDraft({ tagsText: e.target.value })}
                placeholder="AI写作, 文案生成, 效率工具"
              />
            </ProFormField>
            <ProFormField label="分类">
              <Input
                value={draft.category}
                onChange={(e) => updateDraft({ category: e.target.value })}
                placeholder="例：内容生成"
              />
            </ProFormField>
            <ProFormField label="评分" hint="0-5">
              <Input
                type="number"
                value={draft.rating}
                onChange={(e) => updateDraft({ rating: e.target.value })}
                placeholder="例：4.8"
              />
            </ProFormField>
            <ProFormField label="来源">
              <Select
                value={draft.source}
                onValueChange={(v) => updateDraft({ source: v as DraftItem['source'] })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择来源…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">自研</SelectItem>
                  <SelectItem value="partner">合作</SelectItem>
                </SelectContent>
              </Select>
            </ProFormField>
            <ProFormField label="计费状态">
              <Select
                value={draft.priceStatus}
                onValueChange={(v) =>
                  updateDraft({ priceStatus: v as DraftItem['priceStatus'] })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择计费状态…" />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ProFormField>
            <ProFormField label="跳转 URL" required fullWidth>
              <Input
                value={draft.url}
                onChange={(e) => updateDraft({ url: e.target.value })}
                placeholder="https://…"
              />
            </ProFormField>
            <ProFormField label="排序权重" hint="数值越小越靠前">
              <NumberInput
                value={draft.sortOrder}
                onChange={(v) => updateDraft({ sortOrder: v })}
                min={0}
              />
            </ProFormField>
            <ProFormField label="启用状态">
              <div className="flex h-9 items-center gap-2">
                <Switch
                  checked={draft.isEnabled}
                  onCheckedChange={(v) => updateDraft({ isEnabled: v })}
                />
                <span className="text-sm text-muted-foreground">
                  {draft.isEnabled ? '启用中' : '已禁用'}
                </span>
              </div>
            </ProFormField>
            <ProFormField label="Markdown 详情" hint="支持 Markdown 语法" fullWidth>
              <Textarea
                value={draft.contentMarkdown}
                onChange={(e) => updateDraft({ contentMarkdown: e.target.value })}
                rows={6}
                placeholder="可选；C 端浮窗的详情面板"
              />
            </ProFormField>
          </ProForm>
        )}
      </DetailDrawer>

      {/* 删除确认 */}
      <AlertDialog
        open={!!deletingId}
        onOpenChange={(o) => !deleting && !o && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条流量密码？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后 C 端浮窗将立即移除该项。此操作无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}
