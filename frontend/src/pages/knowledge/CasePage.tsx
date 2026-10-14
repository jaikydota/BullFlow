import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Briefcase,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'

import { brandsApi } from '@/api/brands'
import { casesApi } from '@/api/cases'
import { Button } from '@/components/common/Button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { SearchInput } from '@/components/common/SearchInput'
import { Select } from '@/components/common/Select'
import { CaseForm } from '@/components/knowledge/CaseForm'
import { toast } from '@/components/common/Toast'
import { EmptyState, PageContainer, PageHeader } from '@/components/shared'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Brand } from '@/types/brand'
import type { KnowledgeCase } from '@/types/case'
import { ApiError } from '@/types/api'
import { cn } from '@/utils/helpers'

export default function CasePage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<KnowledgeCase[]>([])
  const [loading, setLoading] = useState(true)
  const [brands, setBrands] = useState<Brand[]>([])
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<KnowledgeCase | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeCase | null>(null)
  const [deleting, setDeleting] = useState(false)

  const brandNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of brands) m.set(b.id, b.name)
    return m
  }, [brands])

  useEffect(() => {
    let cancelled = false
    brandsApi
      .list({ page: 1, page_size: 500 })
      .then((res) => {
        if (!cancelled) setBrands(res.items)
      })
      .catch(() => {
        if (!cancelled) setBrands([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 案例 API 暂无服务端过滤，一次性拉满，所有过滤在客户端完成
      const res = await casesApi.list({ page: 1, page_size: 500 })
      setItems(res.items)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('common.failed')
      toast.error(msg)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const handleDelete = async () => {
    const target = deleteTarget
    if (!target) return
    setDeleting(true)
    try {
      await casesApi.delete(target.id)
      toast.success(t('knowledge.mgmt.caseDeleted'))
      setDeleteTarget(null)
      void load()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('common.failed')
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  const brandOptions = useMemo(
    () => [
      { value: '', label: t('knowledge.mgmt.allBrands') },
      ...brands.map((b) => ({ value: b.id, label: b.name })),
    ],
    [brands, t],
  )

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (brandFilter && it.brand_id !== brandFilter) return false
      if (!q) return true
      if (it.title.toLowerCase().includes(q)) return true
      if (it.description?.replace(/<[^>]*>/g, '').toLowerCase().includes(q)) return true
      if (it.industry?.toLowerCase().includes(q)) return true
      if (it.category?.toLowerCase().includes(q)) return true
      if (it.tags?.some((tag) => tag.toLowerCase().includes(q))) return true
      return false
    })
  }, [items, search, brandFilter])

  return (
    <PageContainer size="xl">
      <PageHeader
        title={t('knowledge.case')}
        description="沉淀客户案例、行业故事，作为 AI 内容生成的灵感来源"
        icon={Briefcase}
        iconAccent="info"
        breadcrumbs={[{ label: '资产管理' }, { label: '公司信息' }, { label: t('knowledge.case') }]}
        actions={
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" />
            {t('knowledge.mgmt.createCase')}
          </Button>
        }
      />

      {/* 筛选栏 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="搜索案例标题、行业、标签…"
          className="min-w-[220px] max-w-xs flex-1"
        />
        <div className="w-44">
          <Select
            value={brandFilter}
            onChange={setBrandFilter}
            options={brandOptions}
            placeholder={t('knowledge.mgmt.allBrands')}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          共 {filteredItems.length}
          {filteredItems.length !== items.length && ` / ${items.length}`} 个案例
        </span>
      </div>

      {loading && items.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 rounded-2xl border border-border bg-muted/30 shimmer" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={t('knowledge.mgmt.emptyCases')}
          description={'点击右上角「创建案例」开始添加'}
          action={
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="size-4" />
              {t('knowledge.mgmt.createCase')}
            </Button>
          }
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="无匹配案例"
          description="尝试调整搜索关键词或筛选条件"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map((c) => (
            <CaseCard
              key={c.id}
              item={c}
              brandName={c.brand_id ? brandNameById.get(c.brand_id) ?? null : null}
              onEdit={() => {
                setEditing(c)
                setFormOpen(true)
              }}
              onDelete={() => setDeleteTarget(c)}
            />
          ))}
        </div>
      )}

      <CaseForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={load}
        initialData={editing}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title={t('knowledge.mgmt.deleteCaseTitle')}
        message={t('knowledge.mgmt.deleteCaseMessage', { name: deleteTarget?.title ?? '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </PageContainer>
  )
}

/* ============== CaseCard（紧凑版） ============== */

function CaseCard({
  item,
  brandName,
  onEdit,
  onDelete,
}: {
  item: KnowledgeCase
  brandName: string | null
  onEdit: () => void
  onDelete: () => void
}) {
  const cover = item.cover_image?.trim()
  const tags = (item.tags ?? []).filter(Boolean).slice(0, 3)

  return (
    <div
      className={cn(
        'group flex flex-col overflow-hidden rounded-2xl border border-border bg-card card-hover',
      )}
    >
      {/* 封面 */}
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-amber-500/10 via-rose-500/5 to-muted">
        {cover ? (
          <img
            src={cover}
            alt={item.title}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Briefcase className="size-10 text-amber-500/40" strokeWidth={1.5} />
          </div>
        )}

        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-8 cursor-pointer items-center justify-center rounded-md bg-card/90 text-foreground shadow-soft backdrop-blur hover:bg-card"
                aria-label="更多操作"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
                <Pencil className="size-3.5" />
                编辑
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="size-3.5" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {item.category && (
          <span className="absolute left-2 top-2 rounded-md bg-card/90 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-soft backdrop-blur">
            {item.category}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="space-y-0.5">
          <h3 className="line-clamp-1 text-sm font-semibold text-foreground" title={item.title}>
            {item.title}
          </h3>
          {item.description && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {item.description.replace(/<[^>]*>/g, '')}
            </p>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          {brandName && (
            <span className="inline-flex max-w-[120px] items-center gap-1">
              <span className="size-1.5 rounded-full bg-amber-500/60" />
              <span className="truncate">{brandName}</span>
            </span>
          )}
          {item.industry && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {item.industry}
            </span>
          )}
          {tags.length > 0 && (
            <div className="ml-auto flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
