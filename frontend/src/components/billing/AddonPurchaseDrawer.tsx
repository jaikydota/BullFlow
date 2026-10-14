import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'
import {
  Building2,
  Cloud,
  Coins,
  Globe2,
  Loader2,
  Minus,
  Plus,
  RefreshCcw,
  Smartphone,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Drawer } from '@/components/common/Drawer'
import { parseApiDate } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { TransferAccountInfo } from '@/components/billing/TransferAccountInfo'
import { billingApi } from '@/api/billing'
import { cn } from '@/lib/utils'
import type { Addon, AddonType, OrderCreateResult, PayMethod, TransferConfig } from '@/types/subscription'

type Step = 'choose' | 'creating' | 'paying' | 'expired' | 'paid' | 'transfer_created'

const POLL_INTERVAL_MS = 3000

const ADDON_META: Record<AddonType, { icon: LucideIcon; unitWord: string; accent: string }> = {
  points: { icon: Coins, unitWord: '积分', accent: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  storage: { icon: Cloud, unitWord: 'GB 存储', accent: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  domestic_account: { icon: Users, unitWord: '个国内账号', accent: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  overseas_account: { icon: Globe2, unitWord: '个国外账号', accent: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400' },
}

export type AddonPurchaseDrawerProps = {
  open: boolean
  addon: Addon | null
  onClose: () => void
  onPaid: () => void
}

export function AddonPurchaseDrawer({ open, addon, onClose, onPaid }: AddonPurchaseDrawerProps) {
  const [step, setStep] = useState<Step>('choose')
  const [quantity, setQuantity] = useState(1)
  const [payMethod, setPayMethod] = useState<PayMethod>('alipay')
  const [order, setOrder] = useState<OrderCreateResult | null>(null)
  const [remainingSec, setRemainingSec] = useState(0)
  const [transferConfig, setTransferConfig] = useState<TransferConfig | null>(null)
  const pollTimer = useRef<number | null>(null)
  const countdownTimer = useRef<number | null>(null)

  const stopPolling = () => {
    if (pollTimer.current != null) {
      window.clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }
  const stopCountdown = () => {
    if (countdownTimer.current != null) {
      window.clearInterval(countdownTimer.current)
      countdownTimer.current = null
    }
  }

  // 关闭时重置本地态与定时器
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      setStep('choose')
      setQuantity(1)
      setPayMethod('alipay')
      setOrder(null)
      stopPolling()
      stopCountdown()
    }
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open) return
    billingApi
      .getTransferConfig()
      .then(setTransferConfig)
      .catch(() => setTransferConfig(null))
  }, [open])

  function startPolling(orderNo: string) {
    stopPolling()
    pollTimer.current = window.setInterval(async () => {
      try {
        const o = await billingApi.getOrder(orderNo)
        if (o.status === 'paid') {
          stopPolling()
          stopCountdown()
          setStep('paid')
          onPaid()
        } else if (o.status === 'cancelled' || o.status === 'refunded') {
          stopPolling()
          stopCountdown()
          setStep('expired')
        }
      } catch {
        /* 网络抖动忽略 */
      }
    }, POLL_INTERVAL_MS)
  }

  function startCountdown(expiresAt: string) {
    stopCountdown()
    const target = parseApiDate(expiresAt).getTime()
    const tick = () => {
      const left = Math.max(0, Math.floor((target - Date.now()) / 1000))
      setRemainingSec(left)
      if (left <= 0) {
        stopCountdown()
        stopPolling()
        setStep('expired')
      }
    }
    tick()
    countdownTimer.current = window.setInterval(tick, 1000)
  }

  async function handleConfirmPay() {
    if (!addon) return
    setStep('creating')
    try {
      const result = await billingApi.createAddonOrder(addon.slug, quantity, payMethod)
      setOrder(result)
      if (payMethod === 'transfer') {
        setStep('transfer_created')
        return
      }
      if (result.status === 'paid' && result.auto_activated) {
        setStep('paid')
        onPaid()
        return
      }
      setStep('paying')
      startCountdown(result.expires_at)
      startPolling(result.order_no)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '创建订单失败')
      setStep('choose')
    }
  }

  async function handleClose() {
    if (order && step === 'paying') {
      billingApi.cancelOrder(order.order_no).catch(() => {})
    }
    onClose()
  }

  const meta = addon ? ADDON_META[addon.addon_type] : null
  const totalCents = addon ? addon.price_cents * quantity : 0
  const grantTotal = addon ? addon.quota_amount * quantity : 0
  // 积分加包永久有效；存储/账号加包付费套餐期间有效（升级/续费保留，降级到免费版或到期失效）
  const validityText = addon?.addon_type === 'points' ? '永久有效' : '付费套餐期间有效'

  const yuanLabel = useMemo(
    () => (totalCents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [totalCents],
  )
  const mmss = useMemo(() => {
    const m = Math.floor(remainingSec / 60)
    const s = remainingSec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [remainingSec])

  const Icon = meta?.icon ?? Coins

  return (
    <Drawer open={open} onClose={handleClose} title="购买增量包" width="440px">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
        {addon && meta && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
            <div className={cn('flex size-10 items-center justify-center rounded-lg border', meta.accent)}>
              <Icon className="size-5" strokeWidth={2.25} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-foreground">{addon.name}</div>
              <div className="text-xs text-muted-foreground">
                单份 {addon.quota_amount.toLocaleString()} {meta.unitWord} · ¥
                {(addon.price_cents / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}/份 · {validityText}
              </div>
            </div>
          </div>
        )}

        {step === 'choose' && addon && meta && (
          <>
            {/* 购买份数 */}
            <div className="mb-2 text-sm font-medium text-foreground">购买份数</div>
            <div className="mb-4 flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus className="size-4" />
              </Button>
              <div className="min-w-[3rem] text-center text-lg font-semibold text-foreground">{quantity}</div>
              <Button
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                disabled={quantity >= 99}
                onClick={() => setQuantity((q) => Math.min(99, q + 1))}
              >
                <Plus className="size-4" />
              </Button>
              <span className="ml-1 text-xs text-muted-foreground">
                共获得 <span className="font-semibold text-foreground">{grantTotal.toLocaleString()}</span> {meta.unitWord}
              </span>
            </div>

            {/* 应付金额 */}
            <div className="mb-4 flex flex-col items-center gap-1 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-fuchsia-500/5 px-4 py-3 text-center">
              <div className="text-sm text-muted-foreground">本次应付</div>
              <div className="text-2xl font-bold tracking-tight text-primary">¥{yuanLabel}</div>
            </div>

            {/* 支付方式 */}
            <div className="mb-2 text-sm font-medium text-foreground">选择支付方式</div>
            <div className="space-y-2">
              <PayMethodOption method="alipay" label="支付宝扫码" selected={payMethod === 'alipay'} onClick={() => setPayMethod('alipay')} />
              <PayMethodOption method="wechat" label="微信扫码" selected={payMethod === 'wechat'} onClick={() => setPayMethod('wechat')} />
              {transferConfig?.enabled && (
                <PayMethodOption method="transfer" label="对公转账" selected={payMethod === 'transfer'} onClick={() => setPayMethod('transfer')} />
              )}
            </div>
            <Button className="mt-6 w-full" onClick={handleConfirmPay}>
              确认并支付
            </Button>
          </>
        )}

        {step === 'creating' && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> 正在创建订单…
          </div>
        )}

        {step === 'paying' && order && (
          <div className="flex flex-1 flex-col items-center">
            <div className="mb-3 text-sm text-muted-foreground">
              请使用{payMethod === 'alipay' ? '支付宝' : '微信'}扫一扫
            </div>
            {order.qrcode_url ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <QRCodeSVG value={order.qrcode_url} size={220} level="M" includeMargin />
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-muted/20 p-8 text-sm text-muted-foreground">
                未拿到支付二维码，请刷新重试
              </div>
            )}
            <div className="mt-4 text-xs text-muted-foreground">
              订单号：<span className="font-mono">{order.order_no}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              剩余支付时间：<span className="font-mono font-semibold text-foreground">{mmss}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={async () => {
                if (!order) return
                try {
                  await billingApi.cancelOrder(order.order_no)
                } catch {
                  /* ignore */
                }
                handleClose()
              }}
            >
              <X className="mr-1 size-3.5" /> 取消支付
            </Button>
          </div>
        )}

        {step === 'expired' && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="mb-2 text-sm font-medium text-rose-500">订单已过期</div>
            <div className="mb-4 text-xs text-muted-foreground">请重新创建订单完成支付</div>
            <Button
              variant="outline"
              onClick={() => {
                setStep('choose')
                setOrder(null)
              }}
            >
              <RefreshCcw className="mr-1 size-3.5" /> 重新下单
            </Button>
          </div>
        )}

        {step === 'paid' && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="mb-2 text-sm font-semibold text-emerald-500">支付成功</div>
            <div className="text-xs text-muted-foreground">增量包额度已到账（{validityText}）</div>
          </div>
        )}

        {step === 'transfer_created' && order && (
          <div className="flex flex-1 flex-col gap-3">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
              订单已创建，请按以下信息完成对公转账
            </div>
            {transferConfig && (
              <TransferAccountInfo
                config={transferConfig}
                amountCents={order.amount_cents}
                orderNo={order.order_no}
              />
            )}
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              转账后请到「订阅与账单 → 订单历史」点击「提交核销」上传凭证，财务确认到账后额度自动到账。
            </div>
            <Button className="mt-1 w-full" onClick={() => onPaid()}>
              我已了解
            </Button>
          </div>
        )}
      </div>
    </Drawer>
  )
}

function PayMethodOption({
  method,
  label,
  selected,
  onClick,
}: {
  method: PayMethod
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition',
        selected ? 'border-primary/40 ring-2 ring-primary/20' : 'border-border hover:border-primary/30',
      )}
    >
      <div
        className={cn(
          'flex size-9 items-center justify-center rounded-lg border',
          method === 'alipay'
            ? 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
            : method === 'wechat'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-primary/30 bg-primary/10 text-primary',
        )}
      >
        {method === 'alipay' ? (
          <Wallet className="size-4" strokeWidth={2.25} />
        ) : method === 'wechat' ? (
          <Smartphone className="size-4" strokeWidth={2.25} />
        ) : (
          <Building2 className="size-4" strokeWidth={2.25} />
        )}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">
          {method === 'transfer' ? '企业网银转账 · 人工核销' : '扫码即时到账 · 安全保障'}
        </div>
      </div>
      <div className={cn('size-4 rounded-full border-2', selected ? 'border-primary bg-primary' : 'border-border')} />
    </button>
  )
}
