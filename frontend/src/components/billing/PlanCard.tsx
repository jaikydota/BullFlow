import { useState } from 'react'
import { Check, Crown, Gift, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { IconBox, type IconBoxAccent } from '@/components/shared/IconBox'
import { cn } from '@/lib/utils'
import { trackEvent, EVENTS } from '@/utils/tracking'
import type { Plan, PlanPeriod } from '@/types/subscription'
import {
  PERIOD_LABEL,
  PERIOD_MULTIPLIER,
  PERIOD_UNIT,
  planAvailablePeriods,
  planPeriodCents,
} from '@/types/subscription'

const PLAN_STYLES: Record<string, { accent: IconBoxAccent; icon: LucideIcon }> = {
  free: { accent: 'info', icon: Gift },
  pro: { accent: 'primary', icon: Zap },
  enterprise: { accent: 'warning', icon: Crown },
}

export type PlanCardProps = {
  plan: Plan
  isCurrent?: boolean
  isRecommended?: boolean
  /** 用户当前所属套餐 slug；用于按钮文案：升级 / 降级 / 当前 */
  currentPlanSlug?: string | null
  /** 用户当前套餐档位；用于禁用"降级到更低档位"的按钮（null=无订阅/未知，不限制） */
  currentPlanTier?: number | null
  ctaLabel?: string
  ctaDisabled?: boolean
  /** 选择套餐时把所选计费周期一并上抛 */
  onSelect?: (plan: Plan, period: PlanPeriod) => void
  className?: string
}

function formatPrice(cents: number, period: PlanPeriod): string {
  if (cents === 0) return '免费'
  const yuan = cents / 100
  return `¥${yuan.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}/${PERIOD_UNIT[period]}`
}

function defaultCtaLabel(
  plan: Plan,
  currentPlanSlug?: string | null,
  currentPlanTier?: number | null,
): { label: string; disabled: boolean } {
  if (plan.slug === currentPlanSlug) return { label: '当前套餐', disabled: true }
  // 只能升级到不低于当前档位的套餐：更低档位禁用（降级走客服）
  if (currentPlanTier != null && plan.tier < currentPlanTier)
    return { label: '不可降级', disabled: true }
  if (!currentPlanSlug || currentPlanSlug === 'free') return { label: '立即升级', disabled: false }
  return { label: '升级到此套餐', disabled: false }
}

export function PlanCard({
  plan,
  isCurrent = false,
  isRecommended = false,
  currentPlanSlug,
  currentPlanTier,
  ctaLabel,
  ctaDisabled,
  onSelect,
  className,
}: PlanCardProps) {
  const style = PLAN_STYLES[plan.slug] ?? PLAN_STYLES.pro
  const defaultCta = defaultCtaLabel(plan, currentPlanSlug, currentPlanTier)
  const finalLabel = ctaLabel ?? defaultCta.label
  const finalDisabled = ctaDisabled ?? defaultCta.disabled

  const isHighlight = isRecommended || isCurrent

  const periods = planAvailablePeriods(plan)
  const [period, setPeriod] = useState<PlanPeriod>('month')
  const cents = planPeriodCents(plan, period)
  // 省钱提示：所选周期有效价 < 月付价 × 周期倍数 时展示
  const baseline = plan.monthly_price_cents * PERIOD_MULTIPLIER[period]
  const savings = period !== 'month' && plan.monthly_price_cents > 0 ? Math.max(0, baseline - cents) : 0
  const savingPercent = baseline > 0 ? Math.round((savings / baseline) * 100) : 0

  return (
    <div
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card p-6 shadow-card transition-shadow',
        isHighlight
          ? 'gradient-border shadow-pop'
          : 'border-border hover:shadow-pop',
        className,
      )}
    >
      {isRecommended && (
        <div className="absolute right-0 top-0 rounded-bl-xl bg-gradient-to-r from-primary to-fuchsia-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
          推荐
        </div>
      )}
      {isCurrent && !isRecommended && (
        <div className="absolute right-0 top-0 rounded-bl-xl bg-emerald-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
          当前套餐
        </div>
      )}

      <div className="relative z-10 flex items-center gap-3">
        <IconBox icon={style.icon} accent={style.accent} size="lg" />
        <div className="space-y-0.5">
          <div className="text-base font-semibold text-foreground">{plan.name}</div>
          <div className="text-xs text-muted-foreground">{plan.slug}</div>
        </div>
      </div>

      {/* 计费周期切换：只渲染该套餐已出售的档 */}
      {periods.length > 1 && (
        <div className="relative z-10 mt-5 inline-flex w-full rounded-lg border border-border bg-muted/40 p-0.5">
          {periods.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                'flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium transition',
                period === p
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      )}

      <div className={cn('relative z-10', periods.length > 1 ? 'mt-4' : 'mt-5')}>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight text-foreground">
            {formatPrice(cents, period)}
          </span>
          {savings > 0 && (
            <span className="rounded-md bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              省 ¥{(savings / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
              {savingPercent > 0 ? ` · 立省 ${savingPercent}%` : ''}
            </span>
          )}
        </div>
      </div>

      <ul className="relative z-10 mt-6 flex-1 space-y-2.5 text-sm text-foreground">
        <li className="flex items-start gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" strokeWidth={2.5} />
          <span>
            <span className="font-semibold">{plan.points_quota.toLocaleString()}</span> AI 点数 / 周期
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" strokeWidth={2.5} />
          <span>
            <span className="font-semibold">{plan.storage_gb}GB</span> 知识库 / 媒资存储
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" strokeWidth={2.5} />
          <span>
            <span className="font-semibold">{plan.domestic_accounts}</span> 国内社媒账号
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" strokeWidth={2.5} />
          <span>
            <span className="font-semibold">{plan.overseas_accounts}</span> 海外社媒账号
          </span>
        </li>
        {plan.features.map((f, idx) => (
          <li key={idx} className="flex items-start gap-2 text-muted-foreground">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-500/80" strokeWidth={2.5} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="relative z-10 mt-6">
        <Button
          className={cn(
            'w-full',
            isRecommended &&
              !finalDisabled &&
              'bg-gradient-to-r from-primary to-fuchsia-500 text-white hover:opacity-90',
          )}
          variant={finalDisabled ? 'outline' : isRecommended ? 'default' : 'outline'}
          disabled={finalDisabled}
          onClick={() => {
            trackEvent(EVENTS.UPGRADE_CLICK, { plan: plan.slug, period })
            onSelect?.(plan, period)
          }}
        >
          {finalLabel}
        </Button>
      </div>
    </div>
  )
}
