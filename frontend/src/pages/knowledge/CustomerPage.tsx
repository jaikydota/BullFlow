import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'

import { customersApi } from '@/api/customers'
import { Button } from '@/components/common/Button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { SearchInput } from '@/components/common/SearchInput'
import { CustomerForm } from '@/components/knowledge/CustomerForm'
import { toast } from '@/components/common/Toast'
import { EmptyState, PageContainer, PageHeader } from '@/components/shared'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDebounce } from '@/hooks/useDebounce'
import { usePagination } from '@/hooks/usePagination'
import type { Customer } from '@/types/customer'
import { ApiError } from '@/types/api'
import { cn } from '@/utils/helpers'

/** 根据名字生成稳定的渐变色（避免随机色与重渲染抖动） */
const AVATAR_TONES = [
  'from-violet-500 to-pink-500',
  'from-sky-500 to-indigo-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-red-500',
  'from-cyan-500 to-blue-500',
]
function pickTone(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length]
}
function initialsOf(name: string): string {
  const trimmed = (name || '').trim()
  if (!trimmed) return '?'
  // 中文取首字符；英文取首字母（最多 2 个）
  if (/[一-龥]/.test(trimmed[0])) return trimmed.slice(0, 1)
  const parts = trimmed.split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

export default function CustomerPage() {
  const { t } = useTranslation()
  const { page, pageSize, total, setTotal, onChange, pages } = usePagination(12)
  const [items, setItems] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState(false)
  const skipSearchPageReset = useRef(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await customersApi.list({
        page,
        page_size: pageSize,
        search: debouncedSearch.trim() || undefined,
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
  }, [page, pageSize, debouncedSearch, setTotal, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (skipSearchPageReset.current) {
      skipSearchPageReset.current = false
      return
    }
    onChange(1, pageSize)
  }, [debouncedSearch, onChange, pageSize])

  const handleDelete = async () => {
    const target = deleteTarget
    if (!target) return
    setDeleting(true)
    try {
      await customersApi.delete(target.id)
      toast.success(t('knowledge.mgmt.customerDeleted'))
      setDeleteTarget(null)
      void load()
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
        title={t('knowledge.customer')}
        description="管理客户档案，作为 AI 个性化推荐和定向内容生成的依据"
        icon={Users}
        iconAccent="info"
        breadcrumbs={[{ label: '资产管理' }, { label: '公司信息' }, { label: t('knowledge.customer') }]}
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
            {t('knowledge.mgmt.createCustomer')}
          </Button>
        }
      />

      {/* 筛选栏 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('knowledge.mgmt.searchCustomers')}
          className="min-w-[220px] max-w-md flex-1"
        />
        <span className="text-xs text-muted-foreground">共 {total} 个客户</span>
      </div>

      {loading && items.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-2xl border border-border bg-muted/30 shimmer" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('knowledge.mgmt.emptyCustomers')}
          description={'点击右上角「创建客户」开始添加'}
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
              {t('knowledge.mgmt.createCustomer')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((c) => (
              <CustomerCard
                key={c.id}
                customer={c}
                onEdit={() => {
                  setEditing(c)
                  setFormOpen(true)
                }}
                onDelete={() => setDeleteTarget(c)}
              />
            ))}
          </div>

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

      <CustomerForm
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
        title={t('knowledge.mgmt.deleteCustomerTitle')}
        message={t('knowledge.mgmt.deleteCustomerMessage', { name: deleteTarget?.name ?? '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </PageContainer>
  )
}

/* ============== CustomerCard ============== */

function CustomerCard({
  customer,
  onEdit,
  onDelete,
}: {
  customer: Customer
  onEdit: () => void
  onDelete: () => void
}) {
  const tone = pickTone(customer.id || customer.name || '')
  const initials = initialsOf(customer.name)
  const tags = (customer.tags ?? []).filter(Boolean).slice(0, 4)

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 card-hover',
      )}
    >
      {/* 顶部：头像 + 名 + 公司 + 菜单 */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-base font-semibold text-white shadow-soft',
            tone,
          )}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 text-sm font-semibold text-foreground" title={customer.name}>
            {customer.name}
          </h3>
          {customer.company_name && (
            <div className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-muted-foreground">
              <Building2 className="size-3" />
              <span className="line-clamp-1">{customer.company_name}</span>
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-muted hover:text-foreground"
              aria-label="更多操作"
            >
              <MoreHorizontal className="size-4" />
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

      {/* 行业 / 地区 chip */}
      {(customer.industry || customer.region) && (
        <div className="flex flex-wrap gap-1.5">
          {customer.industry && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {customer.industry}
            </span>
          )}
          {customer.region && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              <MapPin className="size-3" />
              {customer.region}
            </span>
          )}
        </div>
      )}

      {/* 描述 */}
      {customer.description && (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {customer.description}
        </p>
      )}

      {/* 联系方式 */}
      {(customer.contact_email || customer.contact_phone) && (
        <div className="space-y-1 text-[12px] text-muted-foreground">
          {customer.contact_email && (
            <div className="flex items-center gap-1.5 truncate">
              <Mail className="size-3 shrink-0" />
              <span className="truncate">{customer.contact_email}</span>
            </div>
          )}
          {customer.contact_phone && (
            <div className="flex items-center gap-1.5 truncate">
              <Phone className="size-3 shrink-0" />
              <span>{customer.contact_phone}</span>
            </div>
          )}
        </div>
      )}

      {/* 标签 */}
      {tags.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1 border-t border-border/60 pt-2.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
