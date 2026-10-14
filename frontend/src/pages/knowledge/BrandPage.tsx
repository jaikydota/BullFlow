import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Building2,
  FileText,
  Layers,
  Loader2,
  Lock,
  Megaphone,
  Palette,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'

import { brandsApi } from '@/api/brands'
import { Button } from '@/components/common/Button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Input } from '@/components/common/Input'
import { TextArea } from '@/components/form/TextArea'
import { FormField } from '@/components/form/FormField'
import { TagInput } from '@/components/form/TagInput'
import { ColorPicker } from '@/components/form/ColorPicker'
import { MinioImageUpload } from '@/components/form/MinioImageUpload'
import { toast } from '@/components/common/Toast'
import { EmptyState, PageContainer, PageHeader } from '@/components/shared'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Brand, BrandCreate, BrandUpdate } from '@/types/brand'
import { ApiError } from '@/types/api'
import { cn } from '@/utils/helpers'

function initialLetter(name: string) {
  const t = name.trim()
  return t ? t[0]!.toUpperCase() : '?'
}

/* ============== 左侧紧凑行 ============== */

function BrandListRow({
  brand,
  active,
  onSelect,
}: {
  brand: Brand
  active: boolean
  onSelect: () => void
}) {
  const color = brand.brand_color?.trim() || '#7c3aed'
  const hasLogo = !!brand.logo_url?.trim()
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition',
        active ? 'border-primary/40 bg-primary/[0.07]' : 'hover:bg-muted/60',
      )}
    >
      <div
        className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card text-sm font-semibold text-white"
        style={hasLogo ? undefined : { backgroundColor: color }}
      >
        {hasLogo ? (
          <img src={brand.logo_url!} alt={brand.name} className="size-full object-contain p-0.5" />
        ) : (
          initialLetter(brand.name)
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="line-clamp-1 text-[13px] font-semibold text-foreground">{brand.name}</p>
          {brand.is_locked && (
            <Lock className="size-3 shrink-0 text-amber-500" strokeWidth={2.4} />
          )}
        </div>
        {brand.slogan && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{brand.slogan}</p>
        )}
      </div>
    </button>
  )
}

function NewBrandPlaceholderRow({
  active,
  onSelect,
}: {
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-dashed px-2.5 py-2 text-left transition',
        active ? 'border-primary/50 bg-primary/[0.06]' : 'border-border hover:bg-muted/60',
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Plus className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-foreground">新建品牌</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">填写右侧表单后保存</p>
      </div>
    </button>
  )
}

/* ============== 右侧详情编辑面板 ============== */

type TabKey = 'basic' | 'visual' | 'voice'

function BrandDetailPanel({
  brand,
  onSaved,
  onDelete,
}: {
  brand: Brand | null
  onSaved: (saved: Brand) => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  const isEdit = !!brand
  const locked = !!brand?.is_locked

  const [tab, setTab] = useState<TabKey>('basic')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [brandColor, setBrandColor] = useState('#7c3aed')
  const [slogan, setSlogan] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [guidelines, setGuidelines] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    setName(brand?.name ?? '')
    setDescription(brand?.description ?? '')
    setLogoUrl(brand?.logo_url ?? null)
    setBrandColor(brand?.brand_color?.trim() || '#7c3aed')
    setSlogan(brand?.slogan ?? '')
    setTags((brand?.tags ?? []).filter(Boolean))
    setGuidelines(brand?.guidelines ?? '')
    setNameError('')
    setTab('basic')
  }, [brand?.id])

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError(t('knowledge.mgmt.validation.required'))
      setTab('basic')
      return
    }
    setNameError('')
    setSaving(true)
    try {
      if (isEdit && brand) {
        const update: BrandUpdate = locked
          ? {
              name: trimmed,
              description: description.trim() || undefined,
              slogan: slogan.trim() || undefined,
              guidelines: guidelines.trim() || undefined,
            }
          : {
              name: trimmed,
              description: description.trim() || undefined,
              logo_url: logoUrl ?? undefined,
              brand_color: brandColor,
              slogan: slogan.trim() || undefined,
              tags: tags.length ? tags : undefined,
              guidelines: guidelines.trim() || undefined,
            }
        const saved = await brandsApi.update(brand.id, update)
        toast.success(t('knowledge.mgmt.brandUpdated'))
        onSaved(saved)
      } else {
        const payload: BrandCreate = {
          name: trimmed,
          description: description.trim() || undefined,
          logo_url: logoUrl ?? undefined,
          brand_color: brandColor,
          slogan: slogan.trim() || undefined,
          tags: tags.length ? tags : undefined,
          guidelines: guidelines.trim() || undefined,
        }
        const created = await brandsApi.create(payload)
        toast.success(t('knowledge.mgmt.brandCreated'))
        onSaved(created)
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('common.failed')
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card">
      {/* 顶部工具条 */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card text-base font-semibold text-white"
            style={!logoUrl ? { backgroundColor: brandColor } : undefined}
          >
            {logoUrl ? (
              <img src={logoUrl} alt={name} className="size-full object-contain p-0.5" />
            ) : (
              initialLetter(name || '?')
            )}
          </div>
          <div className="min-w-0">
            <h2 className="line-clamp-1 text-[15px] font-semibold text-foreground">
              {isEdit ? name || brand?.name : t('knowledge.mgmt.createBrand')}
            </h2>
            <p className="line-clamp-1 text-[11px] text-muted-foreground">
              {isEdit ? '编辑品牌资料' : '填写品牌资料并保存到知识库'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isEdit && onDelete && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={saving}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              删除
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={saving}
            onClick={handleSave}
          >
            保存
          </Button>
        </div>
      </div>

      {/* Tab 分组 */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TabKey)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="border-b border-border px-5 pt-3 pb-3">
          <TabsList>
            <TabsTrigger value="basic">
              <Building2 className="size-3.5" />
              基础信息
            </TabsTrigger>
            <TabsTrigger value="visual">
              <Palette className="size-3.5" />
              视觉规范
            </TabsTrigger>
            <TabsTrigger value="voice">
              <Megaphone className="size-3.5" />
              营销规范
            </TabsTrigger>
          </TabsList>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-5 py-5">
            <TabsContent value="basic" className="m-0 space-y-5">
              <FormField
                label={t('knowledge.mgmt.fields.name')}
                required
                error={nameError}
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：示例品牌 / Sample Brand"
                />
              </FormField>
              <FormField label={t('knowledge.mgmt.fields.slogan')}>
                <Input
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  placeholder="一句话品牌口号"
                />
              </FormField>
              <FormField label={t('knowledge.mgmt.fields.description')}>
                <TextArea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  placeholder="品牌定位、目标人群、价值主张……"
                />
              </FormField>
            </TabsContent>

            <TabsContent value="visual" className="m-0 space-y-5">
              <FormField
                label={
                  <span className="inline-flex items-center gap-1.5">
                    {t('knowledge.mgmt.fields.logoUrl')}
                    {locked && <Lock className="size-3 text-amber-500" />}
                  </span>
                }
              >
                <MinioImageUpload
                  value={logoUrl}
                  onChange={setLogoUrl}
                  disabled={locked}
                />
              </FormField>
              <FormField
                label={
                  <span className="inline-flex items-center gap-1.5">
                    {t('knowledge.mgmt.fields.brandColor')}
                    {locked && <Lock className="size-3 text-amber-500" />}
                  </span>
                }
              >
                <div
                  className={cn(locked && 'pointer-events-none opacity-70')}
                  aria-disabled={locked || undefined}
                >
                  <ColorPicker value={brandColor} onChange={setBrandColor} />
                </div>
              </FormField>
            </TabsContent>

            <TabsContent value="voice" className="m-0 space-y-5">
              <FormField
                label={
                  <span className="inline-flex items-center gap-1.5">
                    {t('knowledge.mgmt.fields.tags')}
                    {locked && <Lock className="size-3 text-amber-500" />}
                  </span>
                }
              >
                {locked ? (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          #{tag}
                        </span>
                      ))
                    )}
                  </div>
                ) : (
                  <TagInput
                    value={tags}
                    onChange={setTags}
                    placeholder={t('knowledge.mgmt.tagPlaceholder')}
                  />
                )}
              </FormField>
              <FormField label={t('knowledge.mgmt.fields.guidelines')}>
                <TextArea
                  value={guidelines}
                  onChange={(e) => setGuidelines(e.target.value)}
                  rows={10}
                  placeholder="品牌语调、禁用词汇、目标受众等营销规范……"
                />
              </FormField>
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  )
}

/* ============== Page ============== */

export default function BrandPage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  /** 选中的品牌 ID；'new' 表示新建模式 */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await brandsApi.list({ page: 1, page_size: 500 })
      setItems(res.items)
      return res.items
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('common.failed')
      toast.error(msg)
      setItems([])
      return [] as Brand[]
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load().then((list) => {
      setSelectedId((prev) => prev ?? list[0]?.id ?? null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.slogan ?? '').toLowerCase().includes(q) ||
        (b.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
    )
  }, [items, search])

  const selected = useMemo(() => {
    if (!selectedId || selectedId === 'new') return null
    return items.find((b) => b.id === selectedId) ?? null
  }, [items, selectedId])

  const isNewMode = selectedId === 'new'

  const handleSaved = async (saved: Brand) => {
    await load()
    setSelectedId(saved.id)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await brandsApi.delete(deleteTarget.id)
      toast.success(t('knowledge.mgmt.brandDeleted'))
      const remaining = await load()
      setSelectedId(remaining[0]?.id ?? null)
      setDeleteTarget(null)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('common.failed')
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PageContainer size="xl">
      <PageHeader
        title={t('knowledge.brand')}
        description="维护品牌定位、视觉与营销规范，作为 AI 内容生成的语调与品牌基因"
        icon={Layers}
        iconAccent="info"
        breadcrumbs={[
          { label: '资产管理' },
          { label: '公司信息' },
          { label: t('knowledge.brand') },
        ]}
      />

      <div className="grid h-[calc(100vh-260px)] min-h-[520px] gap-4 lg:grid-cols-[300px_1fr]">
        {/* ===== 左侧列表 ===== */}
        <aside className="flex min-h-0 flex-col rounded-2xl border border-border bg-card p-3">
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="mb-2 w-full"
            onClick={() => setSelectedId('new')}
          >
            <Plus className="size-3.5" />
            {t('knowledge.mgmt.createBrand')}
          </Button>

          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索品牌…"
              className="h-8 w-full rounded-lg border border-input bg-muted/40 pl-8 pr-2.5 text-xs outline-none transition placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:ring-2 focus:ring-ring/30"
            />
          </div>

          <ScrollArea className="-mr-1 min-h-0 flex-1 pr-1">
            <div className="space-y-1">
              {isNewMode && (
                <NewBrandPlaceholderRow active onSelect={() => setSelectedId('new')} />
              )}
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-lg bg-muted/40 shimmer" />
                ))
              ) : filtered.length === 0 ? (
                <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                  {search ? '无匹配品牌' : '尚未创建任何品牌'}
                </p>
              ) : (
                filtered.map((b) => (
                  <BrandListRow
                    key={b.id}
                    brand={b}
                    active={selectedId === b.id}
                    onSelect={() => setSelectedId(b.id)}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          <div className="mt-2 border-t border-border pt-2 text-center text-[11px] text-muted-foreground">
            共 {items.length} 个品牌
          </div>
        </aside>

        {/* ===== 右侧详情 ===== */}
        <main className="min-h-0">
          {!selectedId ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-card/50">
              <EmptyState
                icon={FileText}
                title="选择左侧品牌查看详情"
                description={'或点击「新建品牌」录入新的品牌资料'}
                action={
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => setSelectedId('new')}
                  >
                    <Plus className="size-3.5" />
                    {t('knowledge.mgmt.createBrand')}
                  </Button>
                }
              />
            </div>
          ) : loading && !selected && !isNewMode ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              加载中…
            </div>
          ) : (
            <BrandDetailPanel
              key={selectedId ?? 'new'}
              brand={selected}
              onSaved={handleSaved}
              onDelete={selected ? () => setDeleteTarget(selected) : undefined}
            />
          )}
        </main>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title={t('knowledge.mgmt.deleteBrandTitle')}
        message={t('knowledge.mgmt.deleteBrandMessage', { name: deleteTarget?.name ?? '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </PageContainer>
  )
}
