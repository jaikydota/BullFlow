import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'
import { Building2, Loader2, RefreshCcw, Smartphone, Wallet, X } from 'lucide-react'

import { Drawer } from '@/components/common/Drawer'
import { parseApiDate } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { TransferAccountInfo } from '@/components/billing/TransferAccountInfo'
import { billingApi } from '@/api/billing'
import { trackEvent, EVENTS } from '@/utils/tracking'
import { cn } from '@/lib/utils'
import type {
  OrderCreateResult,
  PayMethod,
  Plan,
  PlanPeriod,
  Quote,
  TransferConfig,
} from '@/types/subscription'
import { PERIOD_LABEL, PERIOD_UNIT, planPeriodCents } from '@/types/subscription'

type Step =
  | 'idle'
  | 'loading_quote'
  | 'choose_pay'
  | 'creating'
  | 'paying'
  | 'expired'
  | 'paid'
  | 'transfer_created'

const POLL_INTERVAL_MS = 3000

export type CheckoutDrawerProps = {
  open: boolean
  plan: Plan | null
  /** 用户在套餐卡所选的计费周期 */
  period: PlanPeriod
  onClose: () => void
  onPaid: () => void
}

export function CheckoutDrawer({ open, plan, period, onClose, onPaid }: CheckoutDrawerProps) {
  const [step, setStep] = useState<Step>('idle')
  const [quote, setQuote] = useState<Quote | null>(null)
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

  // 重置 —— drawer 关闭时清理本地态与定时器（合法的"对外副作用"重置）
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      setStep('idle')
      setQuote(null)
      setOrder(null)
      setPayMethod('alipay')
      stopPolling()
      stopCountdown()
    }
  }, [open])

  // 拉 quote —— 输入变化时从远端取数据（合法 effect）
  useEffect(() => {
    if (!open || !plan) return
    let alive = true
    setStep('loading_quote')
    trackEvent(EVENTS.UPGRADE_MODAL_SHOWN, { plan: plan.slug, period })
    billingApi
      .quote(plan.slug, period)
      .then((q) => {
        if (!alive) return
        setQuote(q)
        setStep('choose_pay')
        trackEvent(EVENTS.SELECT_PLAN, { plan: plan?.slug, period })
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : '价格预计算失败')
        if (alive) onClose()
      })
    return () => {
      alive = false
    }
  }, [open, plan, period, onClose])
  /* eslint-enable react-hooks/set-state-in-effect */

  // 拉对公转账配置（决定是否提供该方式 + 下单后展示收款账户）
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
          trackEvent(EVENTS.PAYMENT_SUCCESS, { order_no: orderNo })
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
    if (!plan) return
    setStep('creating')
    trackEvent(EVENTS.PAYMENT_START, { plan: plan?.slug, period, pay_method: payMethod })
    try {
      const result = await billingApi.createOrder(plan.slug, period, payMethod)
      setOrder(result)
      if (payMethod === 'transfer') {
        // 对公转账：展示收款账户，引导用户转账后到订阅页提交核销
        setStep('transfer_created')
        return
      }
      if (result.status === 'paid' && result.auto_activated) {
        trackEvent(EVENTS.PAYMENT_SUCCESS, { plan: plan?.slug, period })
        setStep('paid')
        onPaid()
        return
      }
      setStep('paying')
      startCountdown(result.expires_at)
      startPolling(result.order_no)
    } catch (e: unknown) {
      trackEvent(EVENTS.PAYMENT_FAILED, { plan: plan?.slug, period })
      toast.error(e instanceof Error ? e.message : '创建订单失败')
      setStep('choose_pay')
    }
  }

  async function handleClose() {
    if (order && step === 'paying') {
      // best-effort 取消
      billingApi.cancelOrder(order.order_no).catch(() => {})
    }
    onClose()
  }

  const yuanLabel = useMemo(() => {
    if (!quote) return ''
    return (quote.payable_cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }, [quote])

  const mmss = useMemo(() => {
    const m = Math.floor(remainingSec / 60)
    const s = remainingSec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [remainingSec])

  return (
    <Drawer open={open} onClose={handleClose} title="升级套餐" width="440px">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
        {/* 套餐信息 */}
        {plan && (
          <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">目标套餐</div>
                <div className="text-base font-semibold text-foreground">{plan.name}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">{PERIOD_LABEL[period]}原价</div>
                <div className="text-base font-semibold text-foreground">
                  ¥{(planPeriodCents(plan, period) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
                  <span className="text-xs text-muted-foreground">/{PERIOD_UNIT[period]}</span>
                </div>
              </div>
            </div>
            {quote && quote.action !== 'new' && quote.remaining_days > 0 && (
              <div className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                {quote.note ?? `剩余 ${quote.remaining_days} 天将抵扣 ¥${(quote.remaining_value_cents / 100).toFixed(2)}`}
              </div>
            )}
          </div>
        )}

        {/* 应付金额 */}
        {quote && step !== 'paid' && step !== 'expired' && step !== 'transfer_created' && (
          <div className="mb-4 flex flex-col items-center gap-1 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-fuchsia-500/5 px-4 py-3 text-center">
            <div className="text-sm text-muted-foreground">本次应付</div>
            <div className="text-2xl font-bold tracking-tight text-primary">¥{yuanLabel}</div>
          </div>
        )}

        {/* 选择支付方式 */}
        {step === 'choose_pay' && (
          <>
            <div className="mb-2 text-sm font-medium text-foreground">选择支付方式</div>
            <div className="space-y-2">
              <PayMethodOption
                method="alipay"
                label="支付宝扫码"
                selected={payMethod === 'alipay'}
                onClick={() => setPayMethod('alipay')}
              />
              <PayMethodOption
                method="wechat"
                label="微信扫码"
                selected={payMethod === 'wechat'}
                onClick={() => setPayMethod('wechat')}
              />
              {transferConfig?.enabled && (
                <PayMethodOption
                  method="transfer"
                  label="对公转账"
                  selected={payMethod === 'transfer'}
                  onClick={() => setPayMethod('transfer')}
                />
              )}
            </div>
            <Button className="mt-6 w-full" onClick={handleConfirmPay}>
              确认并支付
            </Button>
          </>
        )}

        {step === 'loading_quote' && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> 正在计算价格…
          </div>
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
                setStep('choose_pay')
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
            <div className="text-xs text-muted-foreground">订阅已生效</div>
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
              转账后请到「订阅与账单 → 订单历史」点击「提交核销」上传凭证，财务确认到账后权益自动开通。
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
        selected
          ? 'border-primary/40 ring-2 ring-primary/20'
          : 'border-border hover:border-primary/30',
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
      <div
        className={cn(
          'size-4 rounded-full border-2',
          selected ? 'border-primary bg-primary' : 'border-border',
        )}
      />
    </button>
  )
}
