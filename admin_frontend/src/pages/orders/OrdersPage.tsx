import * as React from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import {
  Ban,
  Building2,
  CheckCircle,
  Coins,
  CreditCard,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Package,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Smartphone,
  Upload,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageContainer, PageHeader } from '@/components/shared'
import {
  ButtonGroup,
  DataTable,
  DetailModal,
  FilterBar,
  NumberInput,
  ProForm,
  ProFormField,
  SearchInput,
} from '@/components/admin'
import { ApiBusinessError } from '@/lib/api/schema'
import {
  fetchOrderList,
  markOrderPaidApi,
  refundOrderApi,
  rejectTransferApi,
  uploadAdminFileApi,
} from '@/lib/api/saas'
import type { Order, OrderStatus, OrderType, PayMethod } from '@/lib/types'
import { usePagination } from '@/hooks/usePagination'

const typeMap: Record<OrderType, { label: string; icon: typeof FileText }> = {
  subscription: { label: '套餐订阅', icon: CreditCard },
  recharge: { label: '积分充值', icon: Coins },
  value_added: { label: '增值服务', icon: Package },
}

const payMethodMap: Record<PayMethod, { label: string; icon: typeof Smartphone }> = {
  alipay: { label: '支付宝', icon: CreditCard },
  wechat: { label: '微信支付', icon: Smartphone },
  stripe: { label: 'Stripe', icon: CreditCard },
  paypal: { label: 'PayPal', icon: CreditCard },
  transfer: { label: '对公转账', icon: Building2 },
  offline: { label: '线下合同', icon: FileText },
}

function StatusBadge({ status }: { status: OrderStatus | string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: '待支付', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
    reviewing: { label: '待核销', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
    paid: { label: '已支付', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
    cancelled: { label: '已取消', cls: 'bg-muted text-muted-foreground' },
    refunded: { label: '已退款', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  }
  const c = map[status as string] ?? { label: status as string, cls: 'bg-muted' }
  return <Badge className={`${c.cls} hover:${c.cls}`}>{c.label}</Badge>
}

export default function OrdersPage() {
  const pagination = usePagination({ page: 1, pageSize: 20 })
  const { page, pageSize, setPage, setTotal } = pagination

  const [searchInput, setSearchInput] = React.useState('')
  const [appliedQuery, setAppliedQuery] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<'all' | OrderType>('all')
  const [statusFilter, setStatusFilter] = React.useState<'all' | OrderStatus>('all')
  const [orders, setOrders] = React.useState<Order[]>([])
  const [loading, setLoading] = React.useState(false)

  const [detailOrder, setDetailOrder] = React.useState<Order | null>(null)

  const [markPaidOrder, setMarkPaidOrder] = React.useState<Order | null>(null)
  const [voucherUrl, setVoucherUrl] = React.useState<string | null>(null)
  const [voucherUploading, setVoucherUploading] = React.useState(false)
  const [markPaidRemark, setMarkPaidRemark] = React.useState('')
  const [actualRevenue, setActualRevenue] = React.useState(0)
  const [markPaidBusy, setMarkPaidBusy] = React.useState(false)

  const [refundOrder, setRefundOrder] = React.useState<Order | null>(null)
  const [refundReason, setRefundReason] = React.useState('')
  const [refundBusy, setRefundBusy] = React.useState(false)

  const [rejectOrder, setRejectOrder] = React.useState<Order | null>(null)
  const [rejectReason, setRejectReason] = React.useState('')
  const [rejectBusy, setRejectBusy] = React.useState(false)

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchOrderList({
        page,
        page_size: pageSize,
        search: appliedQuery || undefined,
        order_type: typeFilter === 'all' ? undefined : typeFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
      })
      setOrders(data.items ?? [])
      setTotal(data.total)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('订单列表加载失败')
    } finally {
      setLoading(false)
    }
  }, [appliedQuery, page, pageSize, statusFilter, typeFilter, setTotal])

  React.useEffect(() => {
    reload()
  }, [reload])

  const openMarkPaid = (order: Order) => {
    setMarkPaidOrder(order)
    setVoucherUrl(null)
    setMarkPaidRemark('')
    setActualRevenue(order.amount)
  }

  const handleVoucherPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setVoucherUploading(true)
    try {
      const res = await uploadAdminFileApi(file)
      setVoucherUrl(res.url)
    } catch (err) {
      toast.error(err instanceof ApiBusinessError ? err.message : '上传失败')
    } finally {
      setVoucherUploading(false)
    }
  }

  const handleMarkPaid = async () => {
    if (!markPaidOrder) return
    setMarkPaidBusy(true)
    try {
      const updated = await markOrderPaidApi(markPaidOrder.id, {
        voucher_url: voucherUrl?.trim() || null,
        actual_revenue_yuan: Number.isFinite(actualRevenue) ? actualRevenue : null,
        remark: markPaidRemark.trim() || null,
      })
      // 用接口返回值更新本地数组对应行
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
      toast.success(`订单 ${markPaidOrder.orderNo} 已标记已支付`)
      setMarkPaidOrder(null)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('操作失败')
    } finally {
      setMarkPaidBusy(false)
    }
  }

  const handleRefund = async () => {
    if (!refundOrder) return
    if (!refundReason.trim()) return toast.error('请填写退款原因')
    setRefundBusy(true)
    try {
      const updated = await refundOrderApi(refundOrder.id, refundReason.trim())
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
      toast.success(`订单 ${refundOrder.orderNo} 已进入退款`)
      setRefundOrder(null)
      setRefundReason('')
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('退款失败')
    } finally {
      setRefundBusy(false)
    }
  }

  const openReject = (o: Order) => {
    setRejectOrder(o)
    setRejectReason('')
  }

  const handleReject = async () => {
    if (!rejectOrder) return
    if (!rejectReason.trim()) return toast.error('请填写驳回原因')
    setRejectBusy(true)
    try {
      const updated = await rejectTransferApi(rejectOrder.id, rejectReason.trim())
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
      toast.success(`订单 ${rejectOrder.orderNo} 已驳回`)
      setRejectOrder(null)
      setRejectReason('')
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('驳回失败')
    } finally {
      setRejectBusy(false)
    }
  }

  const columns = React.useMemo<ColumnDef<Order, unknown>[]>(
    () => [
      {
        header: '订单号',
        accessorKey: 'orderNo',
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium text-foreground">
            {row.original.orderNo}
          </span>
        ),
      },
      {
        header: '租户',
        accessorKey: 'tenantName',
        cell: ({ row }) => (
          <span className="truncate text-sm">{row.original.tenantName?.trim() || '—'}</span>
        ),
      },
      {
        header: '类型',
        accessorKey: 'type',
        size: 130,
        cell: ({ row }) => {
          const t = typeMap[row.original.type as OrderType] ?? {
            label: row.original.type,
            icon: Package,
          }
          const Icon = t.icon
          return (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Icon className="size-3" strokeWidth={2.25} />
              {t.label}
            </Badge>
          )
        },
      },
      {
        header: '金额',
        accessorKey: 'amount',
        size: 100,
        cell: ({ row }) => (
          <span className="font-medium text-foreground">¥{row.original.amount.toLocaleString()}</span>
        ),
      },
      {
        header: '支付方式',
        accessorKey: 'payMethod',
        size: 130,
        cell: ({ row }) => {
          const pm = payMethodMap[row.original.payMethod as PayMethod] ?? {
            label: row.original.payMethod,
            icon: CreditCard,
          }
          const PayIcon = pm.icon
          return (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <PayIcon className="size-3" strokeWidth={2.25} />
              {pm.label}
            </div>
          )
        },
      },
      {
        header: '状态',
        accessorKey: 'status',
        size: 100,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        header: '实际营收',
        accessorKey: 'actualRevenue',
        size: 110,
        cell: ({ row }) =>
          row.original.actualRevenue !== undefined ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              ¥{row.original.actualRevenue.toLocaleString()}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        header: '创建时间',
        accessorKey: 'createdAt',
        size: 160,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.createdAt}</span>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        size: 60,
        cell: ({ row }) => {
          const o = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" strokeWidth={2.25} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setDetailOrder(o)}>
                  <Eye className="size-3.5" strokeWidth={2.25} />
                  查看详情
                </DropdownMenuItem>
                {(o.status === 'pending' || o.status === 'reviewing') && (
                  <DropdownMenuItem onClick={() => openMarkPaid(o)}>
                    <CheckCircle className="size-3.5" strokeWidth={2.25} />
                    {o.status === 'reviewing' ? '通过核销' : '标记已支付'}
                  </DropdownMenuItem>
                )}
                {o.status === 'reviewing' && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => openReject(o)}
                  >
                    <Ban className="size-3.5" strokeWidth={2.25} />
                    驳回核销
                  </DropdownMenuItem>
                )}
                {o.status === 'paid' && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      setRefundOrder(o)
                      setRefundReason('')
                    }}
                  >
                    <RotateCcw className="size-3.5" strokeWidth={2.25} />
                    退款
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [],
  )

  return (
    <PageContainer>
      <PageHeader
        title="订单管理"
        description="查询、筛选 SaaS 订单；可在明细中标记已支付或发起退款流程"
        icon={ShoppingCart}
        iconAccent="warning"
        breadcrumbs={[{ label: '计费与订单' }, { label: '订单管理' }]}
        actions={
          <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="gap-1.5">
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
            ) : (
              <RefreshCw className="size-3.5" strokeWidth={2.25} />
            )}
            刷新
          </Button>
        }
      />

      <FilterBar
        search={
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            onSubmit={(v) => {
              setAppliedQuery(v.trim())
              setPage(1)
            }}
            onDebouncedChange={(v) => {
              setAppliedQuery(v.trim())
              setPage(1)
            }}
            placeholder="搜索订单号 / 租户名…"
          />
        }
        filters={
          <>
            <ButtonGroup
              value={typeFilter}
              onChange={(v) => {
                setTypeFilter(v)
                setPage(1)
              }}
              options={[
                { value: 'all', label: '全部类型' },
                { value: 'subscription', label: '订阅' },
                { value: 'recharge', label: '充值' },
                { value: 'value_added', label: '增值' },
              ]}
              size="sm"
            />
            <ButtonGroup
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v)
                setPage(1)
              }}
              options={[
                { value: 'all', label: '全部状态' },
                { value: 'pending', label: '待支付' },
                { value: 'reviewing', label: '待核销' },
                { value: 'paid', label: '已支付' },
                { value: 'cancelled', label: '已取消' },
                { value: 'refunded', label: '已退款' },
              ]}
              size="sm"
            />
          </>
        }
      />

      <div className="mt-3">
        <DataTable
          columns={columns}
          data={orders}
          loading={loading}
          total={pagination.total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          rowKey={(r) => r.id}
        />
      </div>

      {/* 详情 Modal */}
      <DetailModal
        open={!!detailOrder}
        onOpenChange={(o) => !o && setDetailOrder(null)}
        title="订单详情"
        size="md"
      >
        {detailOrder && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">订单号</p>
                <p className="mt-0.5 font-mono text-sm font-medium">{detailOrder.orderNo}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">租户</p>
                <p className="mt-0.5 truncate text-sm font-medium">
                  {detailOrder.tenantName ?? '—'}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">类型</p>
                <p className="mt-0.5 text-sm">
                  {typeMap[detailOrder.type as OrderType]?.label ?? detailOrder.type}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">支付方式</p>
                <p className="mt-0.5 text-sm">
                  {payMethodMap[detailOrder.payMethod as PayMethod]?.label ?? detailOrder.payMethod}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">订单金额</p>
                <p className="mt-0.5 text-lg font-semibold">
                  ¥{detailOrder.amount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">实际营收</p>
                <p className="mt-0.5 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                  {detailOrder.actualRevenue !== undefined
                    ? `¥${detailOrder.actualRevenue.toLocaleString()}`
                    : '—'}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">状态</p>
                <p className="mt-0.5">
                  <StatusBadge status={detailOrder.status} />
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">支付时间</p>
                <p className="mt-0.5 text-xs font-mono">{detailOrder.paidAt ?? '—'}</p>
              </div>
            </div>
            {detailOrder.remark && (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="mb-1 text-xs text-muted-foreground">备注</p>
                <p className="text-sm">{detailOrder.remark}</p>
              </div>
            )}
            {detailOrder.voucherUrl && (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="mb-1.5 text-xs text-muted-foreground">转账凭证</p>
                <a href={detailOrder.voucherUrl} target="_blank" rel="noreferrer">
                  <img
                    src={detailOrder.voucherUrl}
                    alt="转账凭证"
                    className="max-h-64 rounded-lg border border-border object-contain"
                  />
                </a>
              </div>
            )}
            <p className="break-all font-mono text-[10px] text-muted-foreground">
              id: {detailOrder.id} · tenantId: {detailOrder.tenantId}
            </p>
          </div>
        )}
      </DetailModal>

      {/* 标记已支付 */}
      <DetailModal
        open={!!markPaidOrder}
        onOpenChange={(o) => !o && setMarkPaidOrder(null)}
        title={
          <div className="flex items-center gap-2">
            <CheckCircle className="size-4 text-primary" strokeWidth={2.25} />
            标记订单已支付
          </div>
        }
        size="md"
        padded={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setMarkPaidOrder(null)}
              disabled={markPaidBusy}
            >
              取消
            </Button>
            <Button onClick={handleMarkPaid} disabled={markPaidBusy}>
              {markPaidBusy && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              确认
            </Button>
          </div>
        }
      >
        {markPaidOrder && (
          <ProForm layout="1-col" className="p-5">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">订单号</p>
              <p className="font-medium">{markPaidOrder.orderNo}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                租户：{markPaidOrder.tenantName ?? '—'} · 金额：¥
                {markPaidOrder.amount.toLocaleString()}
              </p>
            </div>
            {markPaidOrder.voucherUrl && (
              <ProFormField label="用户上传的转账凭证">
                <a href={markPaidOrder.voucherUrl} target="_blank" rel="noreferrer">
                  <img
                    src={markPaidOrder.voucherUrl}
                    alt="转账凭证"
                    className="max-h-56 rounded-lg border border-border object-contain"
                  />
                </a>
              </ProFormField>
            )}
            <ProFormField
              label="收款凭证（可选）"
              hint="线下收款的转账截图 / 合同等，留存对账用。对公订单用户已上传的凭证见上方，通常无需重复上传"
            >
              <div className="space-y-2">
                {voucherUrl ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2">
                    {/\.(jpe?g|png|gif|webp|svg)$/i.test(voucherUrl) ? (
                      <a href={voucherUrl} target="_blank" rel="noreferrer">
                        <img
                          src={voucherUrl}
                          alt="凭证"
                          className="h-16 rounded border border-border object-contain"
                        />
                      </a>
                    ) : (
                      <a href={voucherUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                        已上传文件（点击查看）
                      </a>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-destructive hover:text-destructive"
                      onClick={() => setVoucherUrl(null)}
                    >
                      移除
                    </Button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-primary">
                    {voucherUploading ? (
                      <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />
                    ) : (
                      <Upload className="size-4" strokeWidth={2.25} />
                    )}
                    {voucherUploading ? '上传中…' : '点击上传图片或 PDF'}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      disabled={voucherUploading}
                      onChange={handleVoucherPick}
                    />
                  </label>
                )}
              </div>
            </ProFormField>
            <ProFormField label="实际营收（元）">
              <NumberInput
                value={actualRevenue}
                onChange={setActualRevenue}
                min={0}
                step={0.01}
                precision={2}
                suffix="元"
              />
            </ProFormField>
            <ProFormField label="备注">
              <Input
                placeholder="入账说明…"
                value={markPaidRemark}
                onChange={(e) => setMarkPaidRemark(e.target.value)}
              />
            </ProFormField>
          </ProForm>
        )}
      </DetailModal>

      {/* 退款 */}
      <DetailModal
        open={!!refundOrder}
        onOpenChange={(o) => !o && setRefundOrder(null)}
        title={
          <div className="flex items-center gap-2">
            <RotateCcw className="size-4 text-destructive" strokeWidth={2.25} />
            订单退款
          </div>
        }
        size="md"
        padded={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRefundOrder(null)} disabled={refundBusy}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleRefund} disabled={refundBusy}>
              {refundBusy && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              确认退款
            </Button>
          </div>
        }
      >
        {refundOrder && (
          <ProForm layout="1-col" className="p-5">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">订单号</p>
              <p className="font-medium">{refundOrder.orderNo}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                金额：¥{refundOrder.amount.toLocaleString()}
              </p>
            </div>
            <ProFormField label="退款原因" required>
              <Input
                placeholder="必填"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
              />
            </ProFormField>
          </ProForm>
        )}
      </DetailModal>

      {/* 驳回对公核销 */}
      <DetailModal
        open={!!rejectOrder}
        onOpenChange={(o) => !o && setRejectOrder(null)}
        title={
          <div className="flex items-center gap-2">
            <Ban className="size-4 text-destructive" strokeWidth={2.25} />
            驳回对公核销
          </div>
        }
        size="md"
        padded={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectOrder(null)} disabled={rejectBusy}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejectBusy}>
              {rejectBusy && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              确认驳回
            </Button>
          </div>
        }
      >
        {rejectOrder && (
          <ProForm layout="1-col" className="p-5">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">订单号</p>
              <p className="font-medium">{rejectOrder.orderNo}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                租户：{rejectOrder.tenantName ?? '—'} · 金额：¥{rejectOrder.amount.toLocaleString()}
              </p>
            </div>
            <ProFormField label="驳回原因" required>
              <Input
                placeholder="如：未收到款 / 金额不符，请用户核对后重新提交"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </ProFormField>
            <p className="text-xs text-muted-foreground">
              驳回后订单退回「待提交」，用户会收到通知并可重新上传凭证提交核销。
            </p>
          </ProForm>
        )}
      </DetailModal>
    </PageContainer>
  )
}
