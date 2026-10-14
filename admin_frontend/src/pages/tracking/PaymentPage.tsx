import * as React from 'react'
import { CreditCard, Loader2, MousePointerClick, RefreshCw, ShoppingBag, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { PageContainer, PageHeader, StatCard } from '@/components/shared'
import { BarChart, ChartCard, LineChart } from '@/components/admin'
import { fetchTrackingPayment, type TrackingSummary } from '@/lib/api/tracking'
import { formatCurrency } from '@/lib/format'
import { TimeRangeFilter, type RangeState } from './TimeRangeFilter'

export default function TrackingPaymentPage() {
  const [range, setRange] = React.useState<RangeState>({ range: '7d' })
  const [data, setData] = React.useState<TrackingSummary | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchTrackingPayment(range))
    } catch {
      toast.error('加载支付分析失败')
    } finally {
      setLoading(false)
    }
  }, [range])

  React.useEffect(() => {
    load()
  }, [load])

  const m = data?.metrics
  const trend = data?.trend ?? []

  return (
    <PageContainer>
      <PageHeader
        title="支付分析"
        description="套餐访问、选择、支付发起与成功、收入与转化率"
        icon={CreditCard}
        iconAccent="success"
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            刷新
          </Button>
        }
      />

      <div className="mt-4">
        <TimeRangeFilter value={range} onChange={setRange} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="套餐页访问" value={m?.pricing_visit_users ?? '—'} icon={ShoppingBag} iconAccent="primary" />
        <StatCard title="套餐选择人数" value={m?.plan_select_users ?? '—'} icon={MousePointerClick} iconAccent="primary" />
        <StatCard title="发起支付人数" value={m?.pay_start_users ?? '—'} icon={CreditCard} iconAccent="info" />
        <StatCard title="支付成功人数" value={m?.pay_success_users ?? '—'} icon={CreditCard} iconAccent="success" description={`失败 ${m?.pay_failed_count ?? 0}`} />
        <StatCard title="支付成功率" value={`${m?.pay_success_rate ?? 0}%`} icon={CreditCard} iconAccent="success" />
        <StatCard title="付费转化率" value={`${m?.pay_conversion_rate ?? 0}%`} icon={MousePointerClick} iconAccent="info" description="占注册人数" />
        <StatCard title="总收入" value={m ? formatCurrency(m.revenue_cents) : '—'} icon={Wallet} iconAccent="success" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="支付漏斗趋势" icon={CreditCard} iconAccent="primary" loading={loading} isEmpty={!loading && trend.length === 0}>
          <BarChart
            data={trend.map((d) => ({
              date: String(d.date),
              发起: Number(d.pay_start_users),
              成功: Number(d.pay_success_users),
            }))}
            xKey="date"
            series={[{ dataKey: '发起', color: 'info' }, { dataKey: '成功', color: 'success' }]}
          />
        </ChartCard>
        <ChartCard title="收入趋势" icon={Wallet} iconAccent="success" loading={loading} isEmpty={!loading && trend.length === 0}>
          <LineChart
            data={trend.map((d) => ({ date: String(d.date), 收入: Number(d.revenue_cents) / 100 }))}
            xKey="date"
            series={[{ dataKey: '收入', color: 'success' }]}
            yFormatter={(v) => `¥${v}`}
          />
        </ChartCard>
      </div>
    </PageContainer>
  )
}
