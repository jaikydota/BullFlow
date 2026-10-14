import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'

import { Modal } from '@/components/common/Modal'
import { Button } from '@/components/ui/button'
import { MinioImageUpload } from '@/components/form/MinioImageUpload'
import { TransferAccountInfo } from '@/components/billing/TransferAccountInfo'
import { billingApi } from '@/api/billing'
import type { Order, TransferConfig } from '@/types/subscription'

/**
 * 用户「我已转账」提交核销：展示收款账户 + 上传凭证（可选）+ 备注 → submitTransfer，订单转 reviewing。
 * 被驳回（pending 且有 remark）时顶部展示驳回原因，可重新提交。
 */
export function TransferSubmitModal({
  open,
  order,
  onClose,
  onSubmitted,
}: {
  open: boolean
  order: Order | null
  onClose: () => void
  onSubmitted: () => void
}) {
  const [config, setConfig] = useState<TransferConfig | null>(null)
  const [voucherUrl, setVoucherUrl] = useState<string | null>(null)
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setVoucherUrl(order?.voucher_url ?? null)
    setRemark('')
    billingApi
      .getTransferConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
  }, [open, order])

  const handleSubmit = async () => {
    if (!order) return
    setSubmitting(true)
    try {
      await billingApi.submitTransfer(order.order_no, {
        voucher_url: voucherUrl,
        remark: remark.trim() || null,
      })
      toast.success('已提交核销，请等待财务确认到账')
      onSubmitted()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const isRejected = order?.status === 'pending' && !!order?.remark

  return (
    <Modal open={open} onClose={onClose} title="提交对公转账核销" size="md">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {isRejected && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            上次核销被驳回：{order?.remark}。请核对后重新提交。
          </div>
        )}

        {config && (config.company_name || config.account_number) ? (
          <TransferAccountInfo
            config={config}
            amountCents={order?.amount_cents}
            orderNo={order?.order_no}
          />
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            收款账户信息暂未配置，请联系客服获取转账方式。
          </div>
        )}

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">转账凭证（可选）</p>
          <MinioImageUpload value={voucherUrl} onChange={setVoucherUrl} />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">备注（可选）</p>
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={2}
            placeholder="如转账时间、付款账户等，便于财务核对"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-card px-5 py-3">
        <Button variant="outline" onClick={onClose} disabled={submitting} className="cursor-pointer">
          取消
        </Button>
        <Button onClick={handleSubmit} disabled={submitting} className="cursor-pointer">
          {submitting && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
          提交核销
        </Button>
      </div>
    </Modal>
  )
}
