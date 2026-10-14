import * as React from 'react'
import { Filter, Loader2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { PageContainer, PageHeader, SectionCard } from '@/components/shared'
import { fetchTrackingFunnel, type TrackingFunnel } from '@/lib/api/tracking'
import { TimeRangeFilter, type RangeState } from './TimeRangeFilter'

export default function TrackingFunnelPage() {
  const [range, setRange] = React.useState<RangeState>({ range: '30d' })
  const [data, setData] = React.useState<TrackingFunnel | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchTrackingFunnel(range))
    } catch {
      toast.error('加载转化漏斗失败')
    } finally {
      setLoading(false)
    }
  }, [range])

  React.useEffect(() => {
    load()
  }, [load])

  const steps = data?.steps ?? []

  return (
    <PageContainer>
      <PageHeader
        title="转化漏斗"
        description="页面访问 → 注册 → 进入创作 → 创建项目 → 生成成功 → 导出成功 → 访问套餐 → 发起支付 → 支付成功"
        icon={Filter}
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

      <SectionCard
        title="主流程漏斗"
        description="每步为范围内去重访客数；占比相对首步，环比相对上一步，并给出流失人数"
        icon={Filter}
        className="mt-6"
      >
        <div className="space-y-4">
          {steps.map((s, i) => (
            <div key={s.event}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">
                  {i + 1}. {s.label}
                </span>
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{s.count}</span> 人 · 占首步 {s.rate_from_first}%
                  {i > 0 && (
                    <>
                      {' '}· 环比 {s.rate_from_prev}% · 流失 {s.loss}
                    </>
                  )}
                </span>
              </div>
              <div className="h-3.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.max(s.rate_from_first, 1)}%` }}
                />
              </div>
            </div>
          ))}
          {!loading && steps.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">暂无数据</p>
          )}
        </div>
      </SectionCard>
    </PageContainer>
  )
}
