import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

import { PageContainer } from '@/components/shared/PageContainer'
import { GradientHero } from '@/components/shared/GradientHero'
import { Button } from '@/components/ui/button'
import { PlanCard } from '@/components/billing/PlanCard'
import { CheckoutDrawer } from '@/components/billing/CheckoutDrawer'
import { billingApi } from '@/api/billing'
import { useAuthStore } from '@/stores/authStore'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import type { Plan, PlanPeriod } from '@/types/subscription'

export default function PricingPage() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const subscription = useSubscriptionStore((s) => s.subscription)
  const refreshSub = useSubscriptionStore((s) => s.refresh)

  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<PlanPeriod>('month')

  useEffect(() => {
    let alive = true
    billingApi
      .listPlans()
      .then((data) => {
        if (alive) setPlans(data || [])
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : '加载价格表失败')
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  // 推荐 Pro，没有 pro 套餐则推荐价格最高的非 free
  const recommendedSlug = useMemo<string>(() => {
    if (!plans.length) return ''
    if (plans.find((p) => p.slug === 'pro')) return 'pro'
    const paid = plans.filter((p) => p.monthly_price_cents > 0)
    if (!paid.length) return ''
    return paid.sort((a, b) => a.monthly_price_cents - b.monthly_price_cents)[Math.floor(paid.length / 2)].slug
  }, [plans])

  // 当前套餐档位（从价格表里按 slug 反查），用于禁用"降级到更低档位"按钮
  const currentPlanTier = useMemo<number | null>(() => {
    const slug = subscription?.plan_slug
    if (!slug) return null
    return plans.find((p) => p.slug === slug)?.tier ?? null
  }, [plans, subscription?.plan_slug])

  function handleSelect(plan: Plan, period: PlanPeriod) {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent('/pricing')}`)
      return
    }
    if (plan.slug === subscription?.plan_slug) return
    if (plan.monthly_price_cents === 0) {
      toast.error('当前不支持自助降级到 Free，请联系客服。')
      return
    }
    setSelectedPeriod(period)
    setSelectedPlan(plan)
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-[#F6F5FC] dark:bg-background">
      {/* 公开版顶栏 —— 在 AppLayout 之外渲染 */}
      <div className="sticky top-0 z-20 border-b border-border bg-card/75 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-6 md:px-8">
          <Link to="/" className="flex items-center gap-2.5 cursor-pointer">
            <img src="/logo.png" alt="推量牛" className="size-8 object-contain" />
            <span className="text-sm font-semibold tracking-tight text-foreground">推量牛</span>
          </Link>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="cursor-pointer">
                返回应用
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate('/login')} className="cursor-pointer">
                  登录
                </Button>
                <Button size="sm" onClick={() => navigate('/register')} className="cursor-pointer">
                  注册
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 pt-8 sm:px-6 md:px-8 md:pt-12">
      <PageContainer>
      <GradientHero
        tone="primary"
        eyebrow="Pricing"
        title="推全域流量，擎长效经营 · 一人撑起全域内容矩阵"
        description="灵活的订阅方案，从个人创作者到企业团队，按需选择。所有套餐均支持随时升级，按剩余天数补差价立即生效。"
      />

      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[480px] animate-pulse rounded-2xl border border-border bg-muted/30"
              />
            ))
          : plans.map((p) => (
              <PlanCard
                key={p.id}
                plan={p}
                isCurrent={p.slug === subscription?.plan_slug}
                isRecommended={p.slug === recommendedSlug}
                currentPlanSlug={subscription?.plan_slug ?? null}
                currentPlanTier={currentPlanTier}
                onSelect={handleSelect}
              />
            ))}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        支持支付宝 / 微信扫码 · 升级按剩余天数补差价 · 如需开具发票请联系客服
      </p>

      <CheckoutDrawer
        plan={selectedPlan}
        period={selectedPeriod}
        open={!!selectedPlan}
        onClose={() => setSelectedPlan(null)}
        onPaid={() => {
          setSelectedPlan(null)
          refreshSub()
          toast.success('订阅升级成功！')
          navigate('/account/subscription')
        }}
      />
      </PageContainer>
      </div>
    </div>
  )
}
