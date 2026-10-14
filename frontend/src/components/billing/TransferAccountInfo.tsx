import { Building2, Copy } from 'lucide-react'
import toast from 'react-hot-toast'

import type { TransferConfig } from '@/types/subscription'

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null
  const copy = () => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => toast.success('已复制'))
      .catch(() => {})
  }
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
        <span className="truncate text-right">{value}</span>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-primary"
          aria-label="复制"
        >
          <Copy className="size-3.5" strokeWidth={2.25} />
        </button>
      </span>
    </div>
  )
}

/** 对公转账收款账户展示卡片（下单后 / 提交核销时复用）。 */
export function TransferAccountInfo({
  config,
  amountCents,
  orderNo,
}: {
  config: TransferConfig
  amountCents?: number
  orderNo?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Building2 className="size-4 text-primary" strokeWidth={2.25} />
        对公转账收款信息
      </div>
      <div className="divide-y divide-border/60">
        <Row label="公司名称" value={config.company_name} />
        <Row label="收款户名" value={config.account_name} />
        <Row label="收款账号" value={config.account_number} />
        <Row label="开户银行" value={config.bank_name} />
        <Row label="开户支行" value={config.bank_branch} />
        {amountCents != null && (
          <Row label="转账金额" value={`¥${(amountCents / 100).toFixed(2)}`} />
        )}
        {orderNo && <Row label="订单号" value={orderNo} />}
      </div>
      {config.remark_tip && (
        <p className="mt-2.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          {config.remark_tip}
        </p>
      )}
    </div>
  )
}
