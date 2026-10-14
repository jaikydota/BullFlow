import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'

import { Modal } from '@/components/common/Modal'
import { Button } from '@/components/ui/button'
import { billingApi } from '@/api/billing'
import { cn } from '@/lib/utils'
import type { Invoice, InvoiceApply, InvoiceKind, InvoiceTitleType, Order } from '@/types/subscription'

const inputCls =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

/**
 * 用户对已支付订单申请开票：抬头类型(个人/企业) + 抬头 + 税号(企业) + 普票/专票 + 专票字段 + 邮箱。
 * 表单校验对应后端 validator：企业必填税号；专票必填注册地址/电话/开户行/账号。
 * 被驳回时（existing.status==='rejected'）回填上次信息便于修改后重新申请。
 */
export function InvoiceApplyModal({
  open,
  order,
  existing,
  onClose,
  onApplied,
}: {
  open: boolean
  order: Order | null
  existing: Invoice | null
  onClose: () => void
  onApplied: () => void
}) {
  const [titleType, setTitleType] = useState<InvoiceTitleType>('personal')
  const [title, setTitle] = useState('')
  const [taxNo, setTaxNo] = useState('')
  const [invoiceKind, setInvoiceKind] = useState<InvoiceKind>('normal')
  const [regAddress, setRegAddress] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitleType(existing?.title_type ?? 'personal')
    setTitle(existing?.title ?? '')
    setTaxNo(existing?.tax_no ?? '')
    setInvoiceKind(existing?.invoice_kind ?? 'normal')
    setRegAddress(existing?.reg_address ?? '')
    setRegPhone(existing?.reg_phone ?? '')
    setBankName(existing?.bank_name ?? '')
    setBankAccount(existing?.bank_account ?? '')
    setEmail(existing?.email ?? '')
  }, [open, existing])

  const isCompany = titleType === 'company'
  const isSpecial = invoiceKind === 'special'

  const handleSubmit = async () => {
    if (!order) return
    if (!title.trim()) {
      toast.error('请填写发票抬头')
      return
    }
    if (isCompany && !taxNo.trim()) {
      toast.error('企业抬头必须填写税号')
      return
    }
    if (isSpecial) {
      if (!regAddress.trim() || !regPhone.trim() || !bankName.trim() || !bankAccount.trim()) {
        toast.error('专票需填写注册地址、注册电话、开户行、银行账号')
        return
      }
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('收票邮箱格式不正确')
      return
    }
    const payload: InvoiceApply = {
      title_type: titleType,
      title: title.trim(),
      tax_no: isCompany ? taxNo.trim() : null,
      invoice_kind: invoiceKind,
      reg_address: isSpecial ? regAddress.trim() : null,
      reg_phone: isSpecial ? regPhone.trim() : null,
      bank_name: isSpecial ? bankName.trim() : null,
      bank_account: isSpecial ? bankAccount.trim() : null,
      email: email.trim() || null,
    }
    setSubmitting(true)
    try {
      await billingApi.applyInvoice(order.order_no, payload)
      toast.success('开票申请已提交，请等待财务开具')
      onApplied()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="申请开票" size="md">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {existing?.status === 'rejected' && existing.reject_reason && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            上次申请被驳回：{existing.reject_reason}。请核对后重新提交。
          </div>
        )}

        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          订单 <span className="font-mono text-foreground">{order?.order_no}</span> · 开票金额{' '}
          <span className="font-semibold text-foreground">
            ¥{((order?.amount_cents ?? 0) / 100).toFixed(2)}
          </span>
        </div>

        {/* 抬头类型 */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">抬头类型</p>
          <div className="flex gap-2">
            {(['personal', 'company'] as InvoiceTitleType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTitleType(t)}
                className={cn(
                  'cursor-pointer rounded-lg border px-4 py-1.5 text-sm transition-colors',
                  titleType === t
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted/40',
                )}
              >
                {t === 'personal' ? '个人' : '企业'}
              </button>
            ))}
          </div>
        </div>

        {/* 抬头 */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">
            发票抬头 <span className="text-rose-500">*</span>
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isCompany ? '公司全称' : '个人姓名'}
            className={inputCls}
          />
        </div>

        {/* 税号（企业） */}
        {isCompany && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">
              税号 <span className="text-rose-500">*</span>
            </p>
            <input
              value={taxNo}
              onChange={(e) => setTaxNo(e.target.value)}
              placeholder="纳税人识别号"
              className={inputCls}
            />
          </div>
        )}

        {/* 普票 / 专票 */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">发票类型</p>
          <div className="flex gap-2">
            {(['normal', 'special'] as InvoiceKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setInvoiceKind(k)}
                className={cn(
                  'cursor-pointer rounded-lg border px-4 py-1.5 text-sm transition-colors',
                  invoiceKind === k
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted/40',
                )}
              >
                {k === 'normal' ? '增值税普通发票' : '增值税专用发票'}
              </button>
            ))}
          </div>
        </div>

        {/* 专票字段 */}
        {isSpecial && (
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium text-foreground">
                注册地址 <span className="text-rose-500">*</span>
              </p>
              <input value={regAddress} onChange={(e) => setRegAddress(e.target.value)} className={inputCls} />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">
                注册电话 <span className="text-rose-500">*</span>
              </p>
              <input value={regPhone} onChange={(e) => setRegPhone(e.target.value)} className={inputCls} />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">
                开户行 <span className="text-rose-500">*</span>
              </p>
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium text-foreground">
                银行账号 <span className="text-rose-500">*</span>
              </p>
              <input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className={inputCls} />
            </div>
          </div>
        )}

        {/* 收票邮箱 */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">收票邮箱（可选）</p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="填写后，开票完成将自动把电子发票发送到此邮箱"
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-card px-5 py-3">
        <Button variant="outline" onClick={onClose} disabled={submitting} className="cursor-pointer">
          取消
        </Button>
        <Button onClick={handleSubmit} disabled={submitting} className="cursor-pointer">
          {submitting && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
          提交申请
        </Button>
      </div>
    </Modal>
  )
}
