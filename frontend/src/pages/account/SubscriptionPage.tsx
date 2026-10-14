import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Cloud, Coins, Crown, Globe2, History, Infinity as InfinityIcon, Receipt, ShoppingCart, Sparkles, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import toast from 'react-hot-toast'

import { PageContainer } from '@/components/shared/PageContainer'
import { parseApiDate } from '@/utils/format'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { IconBox } from '@/components/shared/IconBox'
import { Button } from '@/components/ui/button'
import { QuotaPanel } from '@/components/billing/QuotaPanel'
import { CheckoutDrawer } from '@/components/billing/CheckoutDrawer'
import { AddonPurchaseDrawer } from '@/components/billing/AddonPurchaseDrawer'
import { TransferSubmitModal } from '@/components/billing/TransferSubmitModal'
import { InvoiceApplyModal } from '@/components/billing/InvoiceApplyModal'
import { billingApi } from '@/api/billing'
import { cn } from '@/lib/utils'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import type { Addon, AddonType, Invoice, Order, Plan } from '@/types/subscription'
import { PERIOD_LABEL } from '@/types/subscription'
import { ROUTES } from '@/utils/constants'

function fmtDate(s?: string | null): string {
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

const STATUS_LABEL: Record<Order['status'], { text: string; cls: string }> = {
  pending: { text: '待支付', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  reviewing: { text: '待核销', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30' },
  paid: { text: '已支付', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
  cancelled: { text: '已取消', cls: 'bg-muted text-muted-foreground border-border' },
  refunded: { text: '已退款', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30' },
}

const PAY_METHOD_LABEL: Record<string, string> = {
  alipay: '支付宝',
  wechat: '微信',
  stripe: 'Stripe',
  paypal: 'PayPal',
  transfer: '银行转账',
  offline: '线下',
}

export default function SubscriptionPage() {
  const navigate = useNavigate()
  const sub = useSubscriptionStore((s) => s.subscription)
  const loading = useSubscriptionStore((s) => s.loading)
  const fetchSub = useSubscriptionStore((s) => s.fetch)
  const refreshSub = useSubscriptionStore((s) => s.refresh)

  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [plans, setPlans] = useState<Plan[]>([])
  const [upgradeTarget, setUpgradeTarget] = useState<Plan | null>(null)
  const [addons, setAddons] = useState<Addon[]>([])
  const [purchaseAddon, setPurchaseAddon] = useState<Addon | null>(null)
  const [transferOrder, setTransferOrder] = useState<Order | null>(null)
  // 发票：按 order_no 建 map；申请开票弹窗的目标订单 + 既有发票（重新申请时回填）
  const [invoiceMap, setInvoiceMap] = useState<Record<string, Invoice>>({})
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null)

  function refreshInvoices() {
    billingApi
      .listInvoices()
      .then((list) => {
        const m: Record<string, Invoice> = {}
        for (const inv of list) m[inv.order_no] = inv
        setInvoiceMap(m)
      })
      .catch(() => {})
  }

  useEffect(() => {
    fetchSub()
    Promise.all([
      billingApi.listOrders(1, 50).catch(() => null),
      billingApi.listPlans().catch(() => []),
      billingApi.listAddons().catch(() => []),
      billingApi.listInvoices().catch(() => [] as Invoice[]),
    ]).then(([page, ps, ad, invoices]) => {
      setOrders(page?.items ?? [])
      setPlans(ps ?? [])
      setAddons(ad ?? [])
      const m: Record<string, Invoice> = {}
      for (const inv of invoices ?? []) m[inv.order_no] = inv
      setInvoiceMap(m)
      setOrdersLoading(false)
    })
  }, [fetchSub])

  async function handleCancel(order: Order) {
    try {
      await billingApi.cancelOrder(order.order_no)
      toast.success('订单已取消')
      const page = await billingApi.listOrders(1, 50)
      setOrders(page.items)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '取消失败')
    }
  }

  function handleUpgradeClick() {
    // free / 无订阅：去价格页选套餐升级
    if (!sub || sub.plan_slug === 'free') {
      navigate('/pricing')
      return
    }
    // 付费用户：默认「续费当前套餐」（同档 renew 合法，避免误选低档触发降级拦截）；
    // 升级到更高档位请走「查看所有套餐」进价格页选择。
    const current = plans.find((p) => p.slug === sub.plan_slug)
    if (current) {
      setUpgradeTarget(current)
    } else {
      navigate('/pricing')
    }
  }

  if (loading && !sub) {
    return (
      <PageContainer>
        <PageHeader title="订阅与账单" icon={Crown} iconAccent="primary" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted/30" />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="订阅与账单"
        description="查看当前套餐、剩余额度与历史订单"
        icon={Crown}
        iconAccent="primary"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(ROUTES.ACCOUNT_BILLING_DETAILS)} className="cursor-pointer gap-1.5">
              <Receipt className="size-4" strokeWidth={2.25} />
              用量明细
            </Button>
            <Button variant="outline" onClick={() => navigate('/pricing')} className="cursor-pointer">
              查看所有套餐
            </Button>
            <Button onClick={handleUpgradeClick} className="cursor-pointer bg-gradient-to-r from-primary to-fuchsia-500 text-white hover:opacity-90">
              {sub?.plan_slug === 'free' ? '升级套餐' : '续费 / 升级'}
            </Button>
          </>
        }
      />

      {sub && (
        <SectionCard variant="gradient" decorate className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <IconBox icon={Crown} accent="primary" size="lg" />
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">当前套餐</div>
                <div className="text-xl font-bold tracking-tight text-foreground">{sub.plan_name}</div>
                <div className="text-xs text-muted-foreground">
                  计费周期：{PERIOD_LABEL[sub.period] ?? '月付'} · 状态：
                  {sub.status === 'active' ? '生效中' : sub.status === 'expired' ? '已过期' : '已取消'}
                </div>
              </div>
            </div>
            {sub.remaining_days > 30 * 365 ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                <InfinityIcon className="size-4" strokeWidth={2.25} />
                <span className="font-semibold">永久有效</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm">
                <CalendarClock className="size-4 text-muted-foreground" strokeWidth={2.25} />
                <div className="text-foreground">
                  到期：<span className="font-semibold">{fmtDate(sub.expires_at)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">（剩余 {sub.remaining_days} 天）</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6">
            <QuotaPanel sub={sub} />
          </div>
        </SectionCard>
      )}

      {addons.length > 0 && (
        <SectionCard
          title="增量包商城"
          description="按需购买，与套餐配额叠加（积分永久有效；存储 / 账号在付费套餐期间有效，升级续费保留，降级到免费版或到期失效）"
          icon={Sparkles}
          iconAccent="primary"
          className="mb-6"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {addons.map((a) => (
              <AddonShopCard key={a.slug} addon={a} onBuy={() => setPurchaseAddon(a)} />
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="订单历史" icon={History} iconAccent="info">
        {ordersLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
        ) : orders.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">暂无订单</div>
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">订单号</th>
                  <th className="px-3 py-3 font-medium">套餐</th>
                  <th className="px-3 py-3 font-medium">金额</th>
                  <th className="px-3 py-3 font-medium">支付方式</th>
                  <th className="px-3 py-3 font-medium">状态</th>
                  <th className="px-3 py-3 font-medium">创建时间</th>
                  <th className="px-6 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((o) => {
                  const st = STATUS_LABEL[o.status]
                  return (
                    <tr key={o.order_no} className="hover:bg-muted/30">
                      <td className="px-6 py-3 font-mono text-xs text-foreground">{o.order_no}</td>
                      <td className="px-3 py-3 text-foreground">{o.plan_slug ?? '—'}</td>
                      <td className="px-3 py-3 font-semibold text-foreground">
                        ¥{(o.amount_cents / 100).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {PAY_METHOD_LABEL[o.pay_method] ?? o.pay_method}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
                          {st.text}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{fmtDate(o.created_at)}</td>
                      <td className="px-6 py-3">
                        {/* 对公转账待提交：提交核销 + 取消（被驳回则显示原因） */}
                        {o.pay_method === 'transfer' && o.status === 'pending' && (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => setTransferOrder(o)}>
                                提交核销
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-rose-600 hover:bg-rose-500/10"
                                onClick={() => handleCancel(o)}
                              >
                                取消
                              </Button>
                            </div>
                            {o.remark && (
                              <span className="text-[11px] text-rose-500">驳回：{o.remark}</span>
                            )}
                          </div>
                        )}
                        {/* 对公待核销：可补充凭证 + 取消 */}
                        {o.status === 'reviewing' && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setTransferOrder(o)}>
                              补充凭证
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-rose-600 hover:bg-rose-500/10"
                              onClick={() => handleCancel(o)}
                            >
                              取消
                            </Button>
                          </div>
                        )}
                        {/* 扫码待支付：继续支付 + 取消 */}
                        {o.pay_method !== 'transfer' && o.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const p = plans.find((pp) => pp.slug === o.plan_slug)
                                if (p) setUpgradeTarget(p)
                              }}
                            >
                              继续支付
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-rose-600 hover:bg-rose-500/10"
                              onClick={() => handleCancel(o)}
                            >
                              取消
                            </Button>
                          </div>
                        )}
                        {/* 已支付：开票相关 */}
                        {o.status === 'paid' && (() => {
                          const inv = invoiceMap[o.order_no]
                          // 无发票 / 被驳回：可申请 / 重新申请
                          if (!inv || inv.status === 'rejected' || inv.status === 'voided') {
                            return (
                              <div className="flex flex-col gap-1.5">
                                <Button size="sm" variant="outline" onClick={() => setInvoiceOrder(o)}>
                                  {inv?.status === 'rejected' ? '重新申请' : '申请开票'}
                                </Button>
                                {inv?.status === 'rejected' && inv.reject_reason && (
                                  <span className="text-[11px] text-rose-500">驳回：{inv.reject_reason}</span>
                                )}
                              </div>
                            )
                          }
                          // 开票中
                          if (inv.status === 'pending') {
                            return <span className="text-xs text-muted-foreground">开票中</span>
                          }
                          // 已开具：下载 + 发票号
                          return (
                            <div className="flex flex-col gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!inv.invoice_file_url}
                                onClick={() => {
                                  if (inv.invoice_file_url) window.open(inv.invoice_file_url, '_blank')
                                }}
                              >
                                下载发票
                              </Button>
                              {inv.invoice_no && (
                                <span className="text-[11px] text-muted-foreground">
                                  发票号：{inv.invoice_no}
                                </span>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <CheckoutDrawer
        plan={upgradeTarget}
        period="month"
        open={!!upgradeTarget}
        onClose={() => setUpgradeTarget(null)}
        onPaid={() => {
          setUpgradeTarget(null)
          refreshSub()
          billingApi.listOrders(1, 50).then((p) => setOrders(p.items)).catch(() => {})
        }}
      />

      <AddonPurchaseDrawer
        addon={purchaseAddon}
        open={!!purchaseAddon}
        onClose={() => setPurchaseAddon(null)}
        onPaid={() => {
          setPurchaseAddon(null)
          refreshSub()
          billingApi.listOrders(1, 50).then((p) => setOrders(p.items)).catch(() => {})
          toast.success('增量包购买成功，额度已到账')
        }}
      />

      <TransferSubmitModal
        open={!!transferOrder}
        order={transferOrder}
        onClose={() => setTransferOrder(null)}
        onSubmitted={() => {
          setTransferOrder(null)
          billingApi.listOrders(1, 50).then((p) => setOrders(p.items)).catch(() => {})
        }}
      />

      <InvoiceApplyModal
        open={!!invoiceOrder}
        order={invoiceOrder}
        existing={invoiceOrder ? invoiceMap[invoiceOrder.order_no] ?? null : null}
        onClose={() => setInvoiceOrder(null)}
        onApplied={() => {
          setInvoiceOrder(null)
          refreshInvoices()
        }}
      />
    </PageContainer>
  )
}

const ADDON_SHOP_META: Record<AddonType, { icon: LucideIcon; unitWord: string; iconCls: string; blobCls: string }> = {
  points: { icon: Coins, unitWord: '积分', iconCls: 'from-amber-400 to-orange-500', blobCls: 'bg-amber-400/20' },
  storage: { icon: Cloud, unitWord: 'GB 存储', iconCls: 'from-sky-400 to-blue-500', blobCls: 'bg-sky-400/20' },
  domestic_account: { icon: Users, unitWord: '个国内账号', iconCls: 'from-emerald-400 to-teal-500', blobCls: 'bg-emerald-400/20' },
  overseas_account: { icon: Globe2, unitWord: '个国外账号', iconCls: 'from-rose-400 to-pink-500', blobCls: 'bg-rose-400/20' },
}

function AddonShopCard({ addon, onBuy }: { addon: Addon; onBuy: () => void }) {
  const meta = ADDON_SHOP_META[addon.addon_type]
  const Icon = meta.icon
  const validity = addon.addon_type === 'points' ? '永久有效' : '付费套餐期间有效'
  return (
    <div className="card-hover group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-5">
      {/* 类型色装饰光斑 */}
      <div
        className={cn(
          'pointer-events-none absolute -right-10 -top-10 size-28 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-90',
          meta.blobCls,
        )}
      />

      {/* 头部：渐变图标 + 名称 + 有效期 */}
      <div className="relative flex items-center gap-3">
        <div
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm',
            meta.iconCls,
          )}
        >
          <Icon className="size-5" strokeWidth={2.25} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{addon.name}</p>
          <p className="text-[11px] text-muted-foreground">{validity}</p>
        </div>
      </div>

      {/* 单份发放数量 */}
      <div className="relative mt-4 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tracking-tight text-foreground">
          {addon.quota_amount.toLocaleString()}
        </span>
        <span className="text-sm font-medium text-muted-foreground">{meta.unitWord} / 份</span>
      </div>

      {/* 价格 + 购买 */}
      <div className="relative mt-4 flex items-center justify-between border-t border-border/60 pt-4">
        <div className="flex items-baseline gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">¥</span>
          <span className="text-xl font-bold tracking-tight text-foreground">
            {(addon.price_cents / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-muted-foreground">/份</span>
        </div>
        <Button size="sm" onClick={onBuy} className="cursor-pointer gap-1">
          <ShoppingCart className="size-3.5" strokeWidth={2.25} />
          购买
        </Button>
      </div>
    </div>
  )
}
