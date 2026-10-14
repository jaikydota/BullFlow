import * as React from 'react'
import { Download, FilePlus2, Loader2, RefreshCw, Sparkles, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { PageContainer, PageHeader, StatCard } from '@/components/shared'
import { BarChart, ChartCard, LineChart } from '@/components/admin'
import { fetchTrackingCreation, type TrackingSummary } from '@/lib/api/tracking'
import { TimeRangeFilter, type RangeState } from './TimeRangeFilter'

export default function TrackingCreationPage() {
  const [range, setRange] = React.useState<RangeState>({ range: '7d' })
  const [data, setData] = React.useState<TrackingSummary | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchTrackingCreation(range))
    } catch {
      toast.error('加载创作分析失败')
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
        title="创作分析"
        description="创建项目、生成、导出的次数与成功率"
        icon={Sparkles}
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
        <StatCard title="创建项目数" value={m?.create_project_count ?? '—'} icon={FilePlus2} iconAccent="primary" />
        <StatCard title="生成次数" value={m?.generation_count ?? '—'} icon={Sparkles} iconAccent="primary" description={`成功 ${m?.generation_success_count ?? 0} · 失败 ${m?.generation_failed_count ?? 0}`} />
        <StatCard title="生成成功率" value={`${m?.generation_success_rate ?? 0}%`} icon={Sparkles} iconAccent="success" />
        <StatCard title="生成失败率" value={`${m?.generation_failed_rate ?? 0}%`} icon={XCircle} iconAccent="warning" />
        <StatCard title="导出次数" value={m?.export_count ?? '—'} icon={Download} iconAccent="info" description={`成功 ${m?.export_success_count ?? 0} · 失败 ${m?.export_failed_count ?? 0}`} />
        <StatCard title="导出成功率" value={`${m?.export_success_rate ?? 0}%`} icon={Download} iconAccent="success" />
        <StatCard title="导出失败率" value={`${m?.export_failed_rate ?? 0}%`} icon={XCircle} iconAccent="warning" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="生成次数趋势" icon={Sparkles} iconAccent="primary" loading={loading} isEmpty={!loading && trend.length === 0}>
          <BarChart
            data={trend.map((d) => ({ date: String(d.date), 成功: Number(d.generation_success_count), 失败: Number(d.generation_failed_count) }))}
            xKey="date"
            series={[{ dataKey: '成功', color: 'success' }, { dataKey: '失败', color: 'warning' }]}
            stacked
          />
        </ChartCard>
        <ChartCard title="导出次数趋势" icon={Download} iconAccent="info" loading={loading} isEmpty={!loading && trend.length === 0}>
          <LineChart
            data={trend.map((d) => ({ date: String(d.date), 导出: Number(d.export_count), 成功: Number(d.export_success_count) }))}
            xKey="date"
            series={[{ dataKey: '导出', color: 'info' }, { dataKey: '成功', color: 'success' }]}
          />
        </ChartCard>
      </div>
    </PageContainer>
  )
}
