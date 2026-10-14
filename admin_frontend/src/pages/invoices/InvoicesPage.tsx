import * as React from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import {
  Ban,
  Building2,
  CheckCircle,
  Eye,
  Loader2,
  MoreHorizontal,
  ReceiptText,
  RefreshCw,
  Upload,
  User as UserIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { PageContainer, PageHeader } from '@/components/shared'
import {
  ButtonGroup,
  DataTable,
  DetailModal,
  FilterBar,
  ProForm,
  ProFormField,
  SearchInput,
} from '@/components/admin'
import { ApiBusinessError } from '@/lib/api/schema'
import {
  fetchInvoiceList,
  issueInvoiceApi,
  rejectInvoiceApi,
  uploadInvoiceFileApi,
} from '@/lib/api/invoices'
import type { Invoice, InvoiceStatus } from '@/lib/types'
import { usePagination } from '@/hooks/usePagination'

function StatusBadge({ status }: { status: InvoiceStatus | string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: '待开票', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
    issued: { label: '已开具', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
    rejected: { label: '已驳回', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
    voided: { label: '已作废', cls: 'bg-muted text-muted-foreground' },
  }
  const c = map[status as string] ?? { label: status as string, cls: 'bg-muted' }
  return <Badge className={`${c.cls} hover:${c.cls}`}>{c.label}</Badge>
}

function titleTypeLabel(t: string): string {
  return t === 'company' ? '企业' : '个人'
}
function kindLabel(k: string): string {
  return k === 'special' ? '增值税专用发票' : '增值税普通发票'
}

export default function InvoicesPage() {
  const pagination = usePagination({ page: 1, pageSize: 20 })
  const { page, pageSize, setPage, setTotal } = pagination

  const [searchInput, setSearchInput] = React.useState('')
  const [appliedQuery, setAppliedQuery] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'all' | InvoiceStatus>('all')
  const [invoices, setInvoices] = React.useState<Invoice[]>([])
  const [loading, setLoading] = React.useState(false)

  const [detail, setDetail] = React.useState<Invoice | null>(null)

  // 开票
  const [issueInv, setIssueInv] = React.useState<Invoice | null>(null)
  const [invoiceNo, setInvoiceNo] = React.useState('')
  const [invoiceFileUrl, setInvoiceFileUrl] = React.useState<string | null>(null)
  const [fileUploading, setFileUploading] = React.useState(false)
  const [issueBusy, setIssueBusy] = React.useState(false)

  // 驳回
  const [rejectInv, setRejectInv] = React.useState<Invoice | null>(null)
  const [rejectReason, setRejectReason] = React.useState('')
  const [rejectBusy, setRejectBusy] = React.useState(false)

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchInvoiceList({
        page,
        page_size: pageSize,
        search: appliedQuery || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      })
      setInvoices(data.items ?? [])
      setTotal(data.total)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('发票列表加载失败')
    } finally {
      setLoading(false)
    }
  }, [appliedQuery, page, pageSize, statusFilter, setTotal])

  React.useEffect(() => {
    reload()
  }, [reload])

  const openIssue = (inv: Invoice) => {
    setIssueInv(inv)
    setInvoiceNo(inv.invoiceNo ?? '')
    setInvoiceFileUrl(inv.invoiceFileUrl ?? null)
  }

  const handleIssue = async () => {
    if (!issueInv) return
    if (!invoiceNo.trim()) return toast.error('请填写发票号')
    setIssueBusy(true)
    try {
      const updated = await issueInvoiceApi(issueInv.id, {
        invoice_no: invoiceNo.trim(),
        invoice_file_url: invoiceFileUrl?.trim() || null,
      })
      setInvoices((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      toast.success(`发票已${issueInv.status === 'issued' ? '更新' : '开具'}（${issueInv.orderNo ?? ''}）`)
      setIssueInv(null)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('开票失败')
    } finally {
      setIssueBusy(false)
    }
  }

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFileUploading(true)
    try {
      const res = await uploadInvoiceFileApi(file)
      setInvoiceFileUrl(res.url)
    } catch (err) {
      toast.error(err instanceof ApiBusinessError ? err.message : '上传失败')
    } finally {
      setFileUploading(false)
    }
  }

  const handleReject = async () => {
    if (!rejectInv) return
    if (!rejectReason.trim()) return toast.error('请填写驳回原因')
    setRejectBusy(true)
    try {
      const updated = await rejectInvoiceApi(rejectInv.id, rejectReason.trim())
      setInvoices((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      toast.success(`已驳回（${rejectInv.orderNo ?? ''}）`)
      setRejectInv(null)
      setRejectReason('')
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('驳回失败')
    } finally {
      setRejectBusy(false)
    }
  }

  const columns = React.useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      {
        header: '订单号',
        accessorKey: 'orderNo',
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium text-foreground">
            {row.original.orderNo ?? '—'}
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
        header: '抬头',
        accessorKey: 'title',
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            {row.original.titleType === 'company' ? (
              <Building2 className="size-3 text-muted-foreground" strokeWidth={2.25} />
            ) : (
              <UserIcon className="size-3 text-muted-foreground" strokeWidth={2.25} />
            )}
            <span className="max-w-[180px] truncate text-sm">{row.original.title}</span>
          </div>
        ),
      },
      {
        header: '发票类型',
        accessorKey: 'invoiceKind',
        size: 130,
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px]">
            {row.original.invoiceKind === 'special' ? '专票' : '普票'}
          </Badge>
        ),
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
        header: '状态',
        accessorKey: 'status',
        size: 100,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        header: '发票号',
        accessorKey: 'invoiceNo',
        size: 140,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.invoiceNo ?? '—'}
          </span>
        ),
      },
      {
        header: '申请时间',
        accessorKey: 'createdAt',
        size: 160,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.createdAt ?? '—'}</span>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        size: 60,
        cell: ({ row }) => {
          const inv = row.original
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
                <DropdownMenuItem onClick={() => setDetail(inv)}>
                  <Eye className="size-3.5" strokeWidth={2.25} />
                  查看详情
                </DropdownMenuItem>
                {(inv.status === 'pending' || inv.status === 'rejected') && (
                  <DropdownMenuItem onClick={() => openIssue(inv)}>
                    <CheckCircle className="size-3.5" strokeWidth={2.25} />
                    开票
                  </DropdownMenuItem>
                )}
                {inv.status === 'issued' && (
                  <DropdownMenuItem onClick={() => openIssue(inv)}>
                    <CheckCircle className="size-3.5" strokeWidth={2.25} />
                    修改发票
                  </DropdownMenuItem>
                )}
                {inv.status === 'pending' && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      setRejectInv(inv)
                      setRejectReason('')
                    }}
                  >
                    <Ban className="size-3.5" strokeWidth={2.25} />
                    驳回
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
        title="发票管理"
        description="处理用户的开票申请：回填发票号、上传发票文件供下载，或驳回信息有误的申请"
        icon={ReceiptText}
        iconAccent="warning"
        breadcrumbs={[{ label: '计费与订单' }, { label: '发票管理' }]}
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
            placeholder="搜索订单号 / 抬头 / 税号…"
          />
        }
        filters={
          <ButtonGroup
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v)
              setPage(1)
            }}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'pending', label: '待开票' },
              { value: 'issued', label: '已开具' },
              { value: 'rejected', label: '已驳回' },
            ]}
            size="sm"
          />
        }
      />

      <div className="mt-3">
        <DataTable
          columns={columns}
          data={invoices}
          loading={loading}
          total={pagination.total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          rowKey={(r) => r.id}
        />
      </div>

      {/* 详情 */}
      <DetailModal
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        title="发票详情"
        size="md"
      >
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="订单号" mono value={detail.orderNo ?? '—'} />
              <Field label="租户" value={detail.tenantName ?? '—'} />
              <Field label="抬头类型" value={titleTypeLabel(String(detail.titleType))} />
              <Field label="发票类型" value={kindLabel(String(detail.invoiceKind))} />
              <Field label="抬头" value={detail.title} className="col-span-2" />
              {detail.taxNo && <Field label="税号" mono value={detail.taxNo} className="col-span-2" />}
              <Field label="开票金额" value={`¥${detail.amount.toLocaleString()}`} />
              <Field label="状态" valueNode={<StatusBadge status={detail.status} />} />
              {detail.email && <Field label="收票邮箱" value={detail.email} className="col-span-2" />}
            </div>

            {detail.invoiceKind === 'special' && (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">专票信息</p>
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <p>注册地址：{detail.regAddress ?? '—'}</p>
                  <p>注册电话：{detail.regPhone ?? '—'}</p>
                  <p>开户行：{detail.bankName ?? '—'}</p>
                  <p>银行账号：{detail.bankAccount ?? '—'}</p>
                </div>
              </div>
            )}

            {detail.status === 'issued' && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-sm">
                  发票号：<span className="font-mono">{detail.invoiceNo ?? '—'}</span>
                </p>
                {detail.invoiceFileUrl &&
                  (/\.(jpe?g|png|gif|webp|svg)$/i.test(detail.invoiceFileUrl) ? (
                    <a href={detail.invoiceFileUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                      <img
                        src={detail.invoiceFileUrl}
                        alt="发票"
                        className="max-h-64 rounded-lg border border-border object-contain"
                      />
                    </a>
                  ) : (
                    <a
                      href={detail.invoiceFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-sm text-primary underline"
                    >
                      下载 / 查看发票文件
                    </a>
                  ))}
                {detail.issuedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">开具时间：{detail.issuedAt}</p>
                )}
              </div>
            )}

            {detail.status === 'rejected' && detail.rejectReason && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-400">
                驳回原因：{detail.rejectReason}
              </div>
            )}
          </div>
        )}
      </DetailModal>

      {/* 开票 */}
      <DetailModal
        open={!!issueInv}
        onOpenChange={(o) => !o && setIssueInv(null)}
        title={
          <div className="flex items-center gap-2">
            <CheckCircle className="size-4 text-primary" strokeWidth={2.25} />
            {issueInv?.status === 'issued' ? '修改发票' : '开具发票'}
          </div>
        }
        size="md"
        padded={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIssueInv(null)} disabled={issueBusy}>
              取消
            </Button>
            <Button onClick={handleIssue} disabled={issueBusy}>
              {issueBusy && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              确认开具
            </Button>
          </div>
        }
      >
        {issueInv && (
          <ProForm layout="1-col" className="p-5">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">订单号</p>
              <p className="font-medium">{issueInv.orderNo ?? '—'}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                抬头：{issueInv.title} · {kindLabel(String(issueInv.invoiceKind))} · 金额：¥
                {issueInv.amount.toLocaleString()}
              </p>
            </div>
            <ProFormField label="发票号" required>
              <Input
                placeholder="必填"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
              />
            </ProFormField>
            <ProFormField label="发票文件（图片或 PDF，≤ 20MB）">
              <div className="space-y-2">
                {invoiceFileUrl ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2">
                    {/\.(jpe?g|png|gif|webp|svg)$/i.test(invoiceFileUrl) ? (
                      <a href={invoiceFileUrl} target="_blank" rel="noreferrer">
                        <img
                          src={invoiceFileUrl}
                          alt="发票"
                          className="h-16 rounded border border-border object-contain"
                        />
                      </a>
                    ) : (
                      <a
                        href={invoiceFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary underline"
                      >
                        已上传文件（点击查看）
                      </a>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-destructive hover:text-destructive"
                      onClick={() => setInvoiceFileUrl(null)}
                    >
                      移除
                    </Button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-primary">
                    {fileUploading ? (
                      <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />
                    ) : (
                      <Upload className="size-4" strokeWidth={2.25} />
                    )}
                    {fileUploading ? '上传中…' : '点击上传图片或 PDF'}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      disabled={fileUploading}
                      onChange={handleFilePick}
                    />
                  </label>
                )}
                <Input
                  placeholder="或粘贴已托管的文件 URL"
                  value={invoiceFileUrl ?? ''}
                  onChange={(e) => setInvoiceFileUrl(e.target.value || null)}
                />
              </div>
            </ProFormField>
          </ProForm>
        )}
      </DetailModal>

      {/* 驳回 */}
      <DetailModal
        open={!!rejectInv}
        onOpenChange={(o) => !o && setRejectInv(null)}
        title={
          <div className="flex items-center gap-2">
            <Ban className="size-4 text-destructive" strokeWidth={2.25} />
            驳回开票申请
          </div>
        }
        size="md"
        padded={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectInv(null)} disabled={rejectBusy}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejectBusy}>
              {rejectBusy && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              确认驳回
            </Button>
          </div>
        }
      >
        {rejectInv && (
          <ProForm layout="1-col" className="p-5">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">订单号</p>
              <p className="font-medium">{rejectInv.orderNo ?? '—'}</p>
              <p className="mt-1 text-xs text-muted-foreground">抬头：{rejectInv.title}</p>
            </div>
            <ProFormField label="驳回原因" required>
              <Input
                placeholder="如：抬头/税号有误，请用户核对后重新申请"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </ProFormField>
            <p className="text-xs text-muted-foreground">
              驳回后用户会收到通知，可修改信息重新申请开票。
            </p>
          </ProForm>
        )}
      </DetailModal>
    </PageContainer>
  )
}

function Field({
  label,
  value,
  valueNode,
  mono,
  className,
}: {
  label: string
  value?: string
  valueNode?: React.ReactNode
  mono?: boolean
  className?: string
}) {
  return (
    <div className={`rounded-lg border border-border bg-muted/20 p-3 ${className ?? ''}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      {valueNode ? (
        <div className="mt-0.5">{valueNode}</div>
      ) : (
        <p className={`mt-0.5 text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</p>
      )}
    </div>
  )
}
