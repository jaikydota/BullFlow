import * as React from 'react'
import {
  Activity,
  CreditCard,
  Download,
  Eye,
  FilePlus2,
  Loader2,
  LogIn,
  RefreshCw,
  Sparkles,
  UserPlus,
  Wallet,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { PageContainer, PageHeader, StatCard } from '@/components/shared'
import { BarChart, ChartCard, LineChart } from '@/components/admin'
import { fetchTrackingOverview, type TrackingSummary } from '@/lib/api/tracking'
import { formatCurrency } from '@/lib/format'
import { TimeRangeFilter, type RangeState } from './TimeRangeFilter'

export default function TrackingOverviewPage() {
  const [range, setRange] = React.useState<RangeState>({ range: '7d' })
  const [data, setData] = React.useState<TrackingSummary | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchTrackingOverview(range))
    } catch {
      toast.error('加载数据概览失败，请确认 backend 已启动')
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
        title="数据概览"
        description="核心指标、成功率与转化率总览，支持时间范围筛选"
        icon={Activity}
        iconAccent="primary"
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
        <StatCard title="访问人数" value={m?.visit_users ?? '—'} icon={Eye} iconAccent="primary" description={`PV ${m?.visit_pv ?? 0}`} />
        <StatCard title="注册人数" value={m?.register_users ?? '—'} icon={UserPlus} iconAccent="info" description={`注册转化 ${m?.register_conversion_rate ?? 0}%`} />
        <StatCard title="登录人数" value={m?.login_users ?? '—'} icon={LogIn} iconAccent="info" />
        <StatCard title="创建项目" value={m?.create_project_count ?? '—'} icon={FilePlus2} iconAccent="primary" />
        <StatCard title="生成次数" value={m?.generation_count ?? '—'} icon={Sparkles} iconAccent="primary" description={`成功率 ${m?.generation_success_rate ?? 0}%`} />
        <StatCard title="导出次数" value={m?.export_count ?? '—'} icon={Download} iconAccent="info" description={`成功率 ${m?.export_success_rate ?? 0}%`} />
        <StatCard title="付费人数" value={m?.pay_success_users ?? '—'} icon={CreditCard} iconAccent="success" description={`支付成功率 ${m?.pay_success_rate ?? 0}%`} />
        <StatCard title="收入" value={m ? formatCurrency(m.revenue_cents) : '—'} icon={Wallet} iconAccent="success" description={`付费转化 ${m?.pay_conversion_rate ?? 0}%`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="访问 / 注册趋势" icon={Eye} iconAccent="primary" loading={loading} isEmpty={!loading && trend.length === 0}>
          <LineChart
            data={trend.map((d) => ({ date: String(d.date), 访问: Number(d.visit_users), 注册: Number(d.register_users) }))}
            xKey="date"
            series={[{ dataKey: '访问', color: 'primary' }, { dataKey: '注册', color: 'success' }]}
          />
        </ChartCard>
        <ChartCard title="生成 / 导出趋势" icon={Sparkles} iconAccent="primary" loading={loading} isEmpty={!loading && trend.length === 0}>
          <BarChart
            data={trend.map((d) => ({ date: String(d.date), 生成: Number(d.generation_count), 导出: Number(d.export_count) }))}
            xKey="date"
            series={[{ dataKey: '生成', color: 'primary' }, { dataKey: '导出', color: 'warning' }]}
          />
        </ChartCard>
        <ChartCard title="收入趋势" icon={Wallet} iconAccent="success" loading={loading} isEmpty={!loading && trend.length === 0} className="lg:col-span-2">
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
