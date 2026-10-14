import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'

import { brandsApi } from '@/api/brands'
import { productsApi } from '@/api/products'
import { Button } from '@/components/common/Button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { SearchInput } from '@/components/common/SearchInput'
import { Select } from '@/components/common/Select'
import { ProductForm } from '@/components/knowledge/ProductForm'
import { toast } from '@/components/common/Toast'
import { EmptyState, PageContainer, PageHeader } from '@/components/shared'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePagination } from '@/hooks/usePagination'
import type { Brand } from '@/types/brand'
import type { Product } from '@/types/product'
import { ApiError } from '@/types/api'
import { cn } from '@/utils/helpers'

export default function ProductPage() {
  const { t } = useTranslation()
  const { page, pageSize, total, setTotal, onChange, pages } = usePagination(30)
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandFilter, setBrandFilter] = useState('')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
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
      const res = await productsApi.list({
        page,
        page_size: pageSize,
        brand_id: brandFilter || undefined,
      })
      setItems(res.items)
      setTotal(res.total)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('common.failed')
      toast.error(msg)
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, brandFilter, setTotal, t])

  useEffect(() => {
    void load()
  }, [load])

  const handleDelete = async () => {
    const target = deleteTarget
    if (!target) return
    setDeleting(true)
    try {
      await productsApi.delete(target.id)
      toast.success(t('knowledge.mgmt.productDeleted'))
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

  /** 客户端搜索过滤当前页（match name / description / features / tags） */
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true
      if (p.description?.toLowerCase().includes(q)) return true
      if (p.features?.some((f) => f.toLowerCase().includes(q))) return true
      if (p.tags?.some((tag) => tag.toLowerCase().includes(q))) return true
      return false
    })
  }, [items, search])

  return (
    <PageContainer size="xl">
      <PageHeader
        title={t('knowledge.product')}
        description="维护产品信息，作为内容生成与营销素材的基础数据"
        icon={Package}
        iconAccent="info"
        breadcrumbs={[{ label: '资产管理' }, { label: '公司信息' }, { label: t('knowledge.product') }]}
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
            {t('knowledge.mgmt.createProduct')}
          </Button>
        }
      />

      {/* 筛选栏 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="搜索产品名称、描述、卖点…"
          className="min-w-[220px] max-w-xs flex-1"
        />
        <div className="w-44">
          <Select
            value={brandFilter}
            onChange={(val) => {
              setBrandFilter(val)
              onChange(1, pageSize)
            }}
            options={brandOptions}
            placeholder={t('knowledge.mgmt.allBrands')}
          />
        </div>
        <span className="text-xs text-muted-foreground">共 {total} 个产品</span>
      </div>

      {/* 卡片网格 / Loading / Empty */}
      {loading && items.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 rounded-2xl border border-border bg-muted/30 shimmer" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={t('knowledge.mgmt.emptyProducts')}
          description={'点击右上角「创建产品」开始添加'}
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
              {t('knowledge.mgmt.createProduct')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                brandName={p.brand_id ? brandNameById.get(p.brand_id) ?? null : null}
                onEdit={() => {
                  setEditing(p)
                  setFormOpen(true)
                }}
                onDelete={() => setDeleteTarget(p)}
              />
            ))}
          </div>

          {/* 分页 */}
          {pages > 1 && (
            <div className="mt-6 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                第 {page} / {pages} 页 · 共 {total}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => onChange(page - 1, pageSize)}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => onChange(page + 1, pageSize)}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ProductForm
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
        title={t('knowledge.mgmt.deleteProductTitle')}
        message={t('knowledge.mgmt.deleteProductMessage', { name: deleteTarget?.name ?? '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </PageContainer>
  )
}

/* ============== ProductCard ============== */

function ProductCard({
  product,
  brandName,
  onEdit,
  onDelete,
}: {
  product: Product
  brandName: string | null
  onEdit: () => void
  onDelete: () => void
}) {
  const cover = product.cover_image?.trim()
  const features = (product.features ?? []).filter(Boolean).slice(0, 3)
  const extraFeatures = Math.max(0, (product.features?.length ?? 0) - features.length)
  const tags = (product.tags ?? []).filter(Boolean).slice(0, 4)

  return (
    <div
      className={cn(
        'group flex flex-col overflow-hidden rounded-2xl border border-border bg-card card-hover',
      )}
    >
      {/* 封面 */}
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-muted via-muted/60 to-muted/30">
        {cover ? (
          <img
            src={cover}
            alt={product.name}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Package className="size-10 text-muted-foreground/30" strokeWidth={1.5} />
          </div>
        )}

        {/* 操作菜单 */}
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

        {/* 分类徽章（限制宽度避免覆盖右上操作按钮；超长截断 + tooltip） */}
        {product.category && (
          <span
            className="absolute left-2 top-2 inline-block max-w-[calc(100%-3.5rem)] truncate rounded-md bg-card/90 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-soft backdrop-blur"
            title={product.category}
          >
            {product.category}
          </span>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="space-y-0.5">
          <h3 className="line-clamp-1 text-sm font-semibold text-foreground" title={product.name}>
            {product.name}
          </h3>
          {product.description && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          )}
        </div>

        {/* 卖点 */}
        {features.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {features.map((f) => (
              <span
                key={f}
                className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
              >
                {f}
              </span>
            ))}
            {extraFeatures > 0 && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                +{extraFeatures}
              </span>
            )}
          </div>
        )}

        {/* 元信息 */}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          {brandName && (
            <span className="inline-flex max-w-[120px] items-center gap-1">
              <span className="size-1.5 rounded-full bg-primary/50" />
              <span className="truncate">{brandName}</span>
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
