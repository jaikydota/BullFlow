import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  UserPlus,
  Wallet,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import {
  EmptyState,
  GradientHero,
  PageContainer,
  PageHeader,
  SectionCard,
  StatCard,
} from '@/components/shared'
import { BarChart, ChartCard, LineChart } from '@/components/admin'
import { fetchDashboardSummary } from '@/lib/api/dashboard'
import type { DashboardSummary } from '@/lib/api/schema'
import { ApiBusinessError } from '@/lib/api/schema'
import { fetchFinanceMonthly } from '@/lib/api/saas'
import { fetchAnalyticsOverview } from '@/lib/api/analytics'
import type { MonthlyRevenue } from '@/lib/types'
import { formatCurrency } from '@/lib/format'

export default function DashboardPage() {
  const [summary, setSummary] = React.useState<DashboardSummary | null>(null)
  const [financeTrend, setFinanceTrend] = React.useState<MonthlyRevenue[]>([])
  const [genDaily, setGenDaily] = React.useState<Array<{ date: string; generations: number }>>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [dash, fm, ov] = await Promise.all([
        fetchDashboardSummary(),
        fetchFinanceMonthly().catch(() => [] as MonthlyRevenue[]),
        fetchAnalyticsOverview({ days: 7, model_limit: 8, months: 6 }).catch(() => null),
      ])
      setSummary(dash)
      setFinanceTrend(Array.isArray(fm) ? fm.slice(-8) : [])
      setGenDaily(ov?.generation_daily?.series ?? [])
    } catch (e) {
      if (e instanceof ApiBusinessError) {
        toast.error(e.message)
      } else {
        toast.error('无法加载仪表盘摘要，请确认 backend 已启动')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  return (
    <PageContainer>
      <PageHeader
        title="仪表盘"
        description="运营数据概览，掌握租户 / 营收 / 订单 / 内容生成关键指标"
        icon={LayoutDashboard}
        iconAccent="primary"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
            ) : (
              <RefreshCw className="size-3.5" strokeWidth={2.25} />
            )}
            刷新
          </Button>
        }
      />

      {/* Hero */}
      <GradientHero
        tone="primary"
        eyebrow={summary?.stub ? 'Stub 数据' : 'Live 数据'}
        title={<span>欢迎回来，掌握 <span className="text-gradient">推量牛</span> 全局运营</span>}
        description="实时跟踪租户增长、营收回款、订单流转和内容生成"
        actions={
          <>
            <Button asChild>
              <Link to="/admin/analytics">
                打开数据分析 <ArrowRight className="size-4" strokeWidth={2.25} />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/admin/finance">查看财务报表</Link>
            </Button>
          </>
        }
      />

      {/* KPI cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="租户总数"
          value={summary ? summary.tenant_total : '—'}
          icon={Building2}
          iconAccent="primary"
          description="全平台已注册的企业租户数"
        />
        <StatCard
          title="本月新增用户"
          value={summary ? summary.new_tenants_this_month : '—'}
          icon={UserPlus}
          iconAccent="info"
          description="自然月新增注册用户"
          trend={
            summary && summary.new_tenants_this_month > 0
              ? { value: summary.new_tenants_this_month, isPositive: true }
              : undefined
          }
        />
        <StatCard
          title="本月营收"
          value={summary ? formatCurrency(summary.revenue_this_month_cents) : '—'}
          icon={Wallet}
          iconAccent="success"
          description="已支付订单实收金额"
        />
        <StatCard
          title="待处理订单"
          value={summary ? summary.pending_orders : '—'}
          icon={ShoppingCart}
          iconAccent={summary?.pending_orders ? 'warning' : 'neutral'}
          description={summary?.pending_orders ? '需要人工核单 / 退款' : '暂无待办'}
        />
      </div>

      {summary?.notes?.hint != null && (
        <p className="mt-3 text-xs text-muted-foreground">{String(summary.notes.hint)}</p>
      )}

      {/* Charts row 1 */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="月度营收快照"
          description="近 8 个月营收变化"
          icon={TrendingUp}
          iconAccent="success"
          loading={loading}
          isEmpty={!loading && financeTrend.length === 0}
          className="lg:col-span-2"
          toolbar={
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
              <Link to="/admin/finance">
                查看详情 <ArrowRight className="size-3" strokeWidth={2.25} />
              </Link>
            </Button>
          }
        >
          <BarChart
            data={financeTrend.map((m) => ({
              month: (m.month || '').slice(-5),
              营收: m.revenue,
            }))}
            xKey="month"
            series={[{ dataKey: '营收', color: 'success' }]}
            yFormatter={(v) => `¥${v}`}
          />
        </ChartCard>

        <SectionCard title="订阅到期预览" description="跨表交叉查看" icon={Building2}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            后端尚未提供订阅 TTL 聚合视图；请前往「用户管理」与「订单管理」交叉查看订阅到期情况。
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/users">用户管理</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/orders">订单管理</Link>
            </Button>
          </div>
        </SectionCard>
      </div>

      {/* Charts row 2 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="近 7 日生成完成量"
          description="所有租户在过去 7 天的内容生成完成数"
          icon={LayoutDashboard}
          iconAccent="article"
          loading={loading}
          isEmpty={!loading && genDaily.length === 0}
          className="lg:col-span-2"
        >
          <LineChart
            data={genDaily.map((d) => ({ date: d.date, 生成数: d.generations }))}
            xKey="date"
            series={[{ dataKey: '生成数', color: 'article' }]}
          />
        </ChartCard>

        <SectionCard
          title="操作建议"
          description="仪表盘仅看趋势，详细分析请进数据分析"
          icon={TrendingUp}
        >
          <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>· 用户 / 营收 / 订单 KPI 与上方一致</li>
            <li>· 完整图表请进入「数据分析」</li>
            <li>· 财务核对请进入「财务报表」</li>
          </ul>
          <Button asChild variant="outline" size="sm" className="mt-3 w-full">
            <Link to="/admin/analytics">
              打开数据分析 <ArrowRight className="size-3.5" strokeWidth={2.25} />
            </Link>
          </Button>
        </SectionCard>
      </div>

      {/* Pending orders pointer */}
      <SectionCard
        title="待处理订单"
        description="与顶部「待处理订单」KPI 一致；列表与操作请到订单管理"
        icon={ShoppingCart}
        iconAccent="warning"
        className="mt-4"
        actions={
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
            <Link to="/admin/orders">
              查看全部 <ArrowRight className="size-3" strokeWidth={2.25} />
            </Link>
          </Button>
        }
      >
        <EmptyState
          icon={ShoppingCart}
          title={summary && summary.pending_orders > 0 ? `${summary.pending_orders} 个待办` : '暂无待办'}
          description="不在此页面罗列订单行；请在「订单管理」按状态筛选 pending"
          action={
            <Button asChild>
              <Link to="/admin/orders">前往订单管理</Link>
            </Button>
          }
        />
      </SectionCard>
    </PageContainer>
  )
}
