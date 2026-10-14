import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Loader2, Receipt } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { parseApiDate } from '@/utils/format'
import { PageContainer, PageHeader, SectionCard } from '@/components/shared'
import { billingApi, type CreditTransaction, type CreditTxBizType } from '@/api/billing'
import { usePagination } from '@/hooks/usePagination'
import { cn } from '@/utils/helpers'
import { ROUTES } from '@/utils/constants'

const BIZ_TYPE_TABS: { key: '' | CreditTxBizType; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'chat', label: '对话' },
  { key: 'article', label: '文章' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
  { key: 'distribution', label: '分发' },
  { key: 'grant_addon', label: '增量包' },
  { key: 'grant_subscription', label: '订阅赠送' },
  { key: 'admin_adjust', label: '管理调整' },
]

const BIZ_BADGE: Record<string, { label: string; cls: string }> = {
  chat: { label: '对话', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30' },
  article: { label: '文章', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30' },
  image: { label: '图片', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
  video: { label: '视频', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30' },
  distribution: { label: '分发', cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30' },
  grant_addon: { label: '增量包', cls: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/30' },
  grant_subscription: { label: '订阅赠送', cls: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30' },
  admin_adjust: { label: '管理调整', cls: 'bg-muted text-muted-foreground border-border' },
}

function fmtDateTime(s: string | null): string {
  if (!s) return '—'
  try {
    return parseApiDate(s).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return s
  }
}

function fmtPrice(n: number | null): string {
  if (n === null || n === undefined) return '—'
  return n.toFixed(4).replace(/\.?0+$/, '')
}

export default function BillingDetailsPage() {
  const navigate = useNavigate()
  const { page, pageSize, total, setTotal, onChange, reset, pages } = usePagination(20)
  const [tab, setTab] = useState<'' | CreditTxBizType>('')
  const [items, setItems] = useState<CreditTransaction[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const data = await billingApi.listCreditTransactions({
        page,
        page_size: pageSize,
        biz_type: tab || undefined,
      })
      setItems(data?.items ?? [])
      setTotal(data?.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, tab, setTotal])

  useEffect(() => {
    fetch()
  }, [fetch])

  // tab 切换时重置到第 1 页
  useEffect(() => {
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <PageContainer>
      <PageHeader
        title="用量明细"
        description="所有积分扣减与发放的明细记录"
        icon={Receipt}
        iconAccent="info"
        actions={
          <Button
            variant="outline"
            onClick={() => navigate(ROUTES.ACCOUNT_SUBSCRIPTION)}
            className="cursor-pointer"
          >
            返回订阅
          </Button>
        }
      />

      {/* tab 筛选 */}
      <div className="mb-4 flex flex-wrap gap-1.5 border-b border-border pb-3">
        {BIZ_TYPE_TABS.map((t) => (
          <button
            key={t.key || 'all'}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'flex cursor-pointer items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-app',
              tab === t.key
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <SectionCard>
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            暂无{tab ? '该类型' : ''}的扣费记录
          </div>
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">时间</th>
                  <th className="px-3 py-3 font-medium">类型</th>
                  <th className="px-3 py-3 font-medium">模型</th>
                  <th className="px-3 py-3 font-medium">描述</th>
                  <th className="px-3 py-3 text-right font-medium">单价</th>
                  <th className="px-3 py-3 text-right font-medium">计量</th>
                  <th className="px-3 py-3 text-right font-medium">变动</th>
                  <th className="px-3 py-3 text-right font-medium">套餐余额</th>
                  <th className="px-6 py-3 text-right font-medium">永久余额</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((r) => {
                  const badge = BIZ_BADGE[r.biz_type] ?? {
                    label: r.biz_type,
                    cls: 'bg-muted text-muted-foreground border-border',
                  }
                  const sign = r.direction === 'debit' ? '-' : '+'
                  const amountCls =
                    r.direction === 'debit'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-6 py-2.5 text-xs text-muted-foreground">
                        {fmtDateTime(r.created_at)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
                            badge.cls,
                          )}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                        {r.model_id ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 max-w-[260px] truncate text-xs text-foreground" title={r.remark ?? ''}>
                        {r.remark ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                        {fmtPrice(r.unit_price)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                        {r.units?.toLocaleString() ?? '—'}
                      </td>
                      <td className={cn('px-3 py-2.5 text-right font-semibold', amountCls)}>
                        {sign}
                        {r.amount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                        {r.balance_after_sub.toLocaleString()}
                      </td>
                      <td className="px-6 py-2.5 text-right font-mono text-xs text-muted-foreground">
                        {r.balance_after_addon.toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between gap-3 px-6 text-xs text-muted-foreground">
            <span>
              第 {page} / {pages} 页 · 共 {total} 条
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
      </SectionCard>
    </PageContainer>
  )
}
