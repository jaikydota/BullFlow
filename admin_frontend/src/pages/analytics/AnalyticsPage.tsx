import * as React from 'react'
import {
  BarChart3,
  Cpu,
  FileText,
  Layers,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  PageContainer,
  PageHeader,
  SectionCard,
  StatCard,
} from '@/components/shared'
import { BarChart, ChartCard } from '@/components/admin'
import { fetchAnalyticsOverview, type AnalyticsOverview } from '@/lib/api/analytics'
import { ApiBusinessError } from '@/lib/api/schema'

export default function AnalyticsPage() {
  const [overview, setOverview] = React.useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetchAnalyticsOverview({ months: 12, days: 14, model_limit: 15 })
      setOverview(d)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('统计数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const daily = overview?.generation_daily?.series ?? []
  const models = overview?.model_usage_generations?.items ?? []
  const content = overview?.content_stats
  const registrations = overview?.user_registrations?.series ?? []
  const orderBy = overview?.order_status?.by_status ?? {}

  return (
    <PageContainer>
      <PageHeader
        title="数据分析"
        description="平台侧聚合指标，均以服务端汇总为准"
        icon={BarChart3}
        iconAccent="primary"
        breadcrumbs={[{ label: '数据概览' }, { label: '数据分析' }]}
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
            ) : (
              <RefreshCw className="size-3.5" strokeWidth={2.25} />
            )}
            刷新
          </Button>
        }
      />

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="本月新增用户"
          value={content?.new_users_this_month ?? '—'}
          icon={Users}
          iconAccent="info"
          description="role=user，来自 content_stats"
        />
        <StatCard
          title="本月完成生成"
          value={content?.completed_generations_this_month ?? '—'}
          icon={FileText}
          iconAccent="article"
          description="GeneratedContent completed"
        />
        <StatCard
          title="本月完成文档"
          value={content?.documents_completed_this_month ?? '—'}
          icon={Layers}
          iconAccent="image"
          description="Document completed"
        />
        <StatCard
          title="累计完成生成"
          value={content?.generation_total_all_time ?? '—'}
          icon={BarChart3}
          iconAccent="success"
          description="全库 completed"
        />
      </div>

      {/* 图表行 1 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="近期生成完成量"
          description="按日统计的近 14 日完成量"
          icon={FileText}
          iconAccent="article"
          loading={loading}
          isEmpty={!loading && daily.length === 0}
        >
          <BarChart
            data={daily.map((d) => ({ date: d.date, 完成数: d.generations }))}
            xKey="date"
            series={[{ dataKey: '完成数', color: 'article' }]}
          />
        </ChartCard>

        <ChartCard
          title="模型使用排行"
          description="按 completed 生成次数分组 model_name"
          icon={Cpu}
          iconAccent="primary"
          loading={loading}
          isEmpty={!loading && models.length === 0}
        >
          <BarChart
            data={models.map((m) => ({ model: m.modelName || '—', 次数: m.count }))}
            xKey="model"
            series={[{ dataKey: '次数', color: 'primary' }]}
          />
        </ChartCard>
      </div>

      {/* 图表行 2 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard title="订单状态分布" description="order_status.by_status" icon={Layers}>
          {Object.keys(orderBy).length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无订单或未建表降级为空</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(orderBy).map(([k, v]) => (
                <Badge key={k} variant="secondary" className="px-2.5 py-1 text-xs">
                  {k}: <span className="ml-1 font-semibold">{v}</span>
                </Badge>
              ))}
            </div>
          )}
        </SectionCard>

        <ChartCard
          title="用户注册趋势"
          description="user_registrations.series 近 12 个月"
          icon={Users}
          iconAccent="info"
          loading={loading}
          isEmpty={!loading && registrations.length === 0}
        >
          <BarChart
            data={registrations.map((r) => ({ month: r.month.slice(-5), 新增: r.new_users }))}
            xKey="month"
            series={[{ dataKey: '新增', color: 'info' }]}
          />
        </ChartCard>
      </div>
    </PageContainer>
  )
}
