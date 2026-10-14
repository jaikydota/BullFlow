import * as React from 'react'
import {
  Coins,
  CreditCard,
  Download,
  Receipt,
  ShoppingCart,
  Wallet,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import {
  EmptyState,
  PageContainer,
  PageHeader,
  SectionCard,
  StatCard,
} from '@/components/shared'
import { BarChart, ChartCard, DetailModal, PieChart } from '@/components/admin'
import {
  fetchFinanceMonthly,
  fetchFinanceSummary,
  type FinanceSummary,
} from '@/lib/api/saas'
import type { MonthlyRevenue } from '@/lib/types'
import { ApiBusinessError } from '@/lib/api/schema'

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csvContent = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export default function FinancePage() {
  const [exportOpen, setExportOpen] = React.useState(false)
  const [monthlyRevenue, setMonthlyRevenue] = React.useState<MonthlyRevenue[]>([])
  const [summary, setSummary] = React.useState<FinanceSummary | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([fetchFinanceMonthly(), fetchFinanceSummary()])
      .then(([rows, s]) => {
        if (!cancelled) {
          setMonthlyRevenue(rows as MonthlyRevenue[])
          setSummary(s)
        }
      })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof ApiBusinessError) toast.error(e.message)
        else toast.error('财务汇总加载失败')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const currentMonth = monthlyRevenue[monthlyRevenue.length - 1] ?? {
    month: '',
    revenue: 0,
    orderCount: 0,
    pointsRecharge: 0,
    subscriptionRevenue: 0,
    valueAddedRevenue: 0,
  }
  const lastMonth = monthlyRevenue.length > 1 ? monthlyRevenue[monthlyRevenue.length - 2] : null
  const revenueChange =
    lastMonth && lastMonth.revenue
      ? Number((((currentMonth.revenue - lastMonth.revenue) / lastMonth.revenue) * 100).toFixed(1))
      : 0
  const orderChange =
    lastMonth && lastMonth.orderCount
      ? Number((((currentMonth.orderCount - lastMonth.orderCount) / lastMonth.orderCount) * 100).toFixed(1))
      : 0

  const handleExportRevenue = () => {
    const rows: (string | number)[][] = [
      ['月份', '总营收(元)', '订单数', '积分充值(元)', '订阅营收(元)', '增值服务(元)'],
      ...monthlyRevenue.map((m) => [
        m.month,
        m.revenue,
        m.orderCount,
        m.pointsRecharge,
        m.subscriptionRevenue,
        m.valueAddedRevenue,
      ]),
    ]
    downloadCSV(`营收报表_${new Date().toISOString().slice(0, 10)}.csv`, rows)
    toast.success('营收报表已导出')
    setExportOpen(false)
  }

  const pieData = [
    { name: '订阅', value: currentMonth.subscriptionRevenue },
    { name: '积分充值', value: currentMonth.pointsRecharge },
    { name: '增值服务', value: currentMonth.valueAddedRevenue },
  ].filter((d) => d.value > 0)

  return (
    <PageContainer>
      <PageHeader
        title="财务报表"
        description="营收与订单维度的汇总及趋势；租户积分流水与消耗排行待后续能力开放"
        icon={Receipt}
        iconAccent="success"
        breadcrumbs={[{ label: '数据概览' }, { label: '财务报表' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5">
            <Download className="size-3.5" strokeWidth={2.25} />
            导出报表
          </Button>
        }
      />

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="本月营收"
          value={`¥${currentMonth.revenue.toLocaleString()}`}
          icon={Wallet}
          iconAccent="success"
          description="较上月"
          trend={{ value: Math.abs(revenueChange), isPositive: revenueChange >= 0 }}
        />
        <StatCard
          title="本月订单"
          value={currentMonth.orderCount}
          icon={ShoppingCart}
          iconAccent="info"
          description="较上月"
          trend={{ value: Math.abs(orderChange), isPositive: orderChange >= 0 }}
        />
        <StatCard
          title="累计已付总额"
          value={summary ? `¥${Number(summary.total_revenue_yuan).toLocaleString()}` : '—'}
          icon={Coins}
          iconAccent="warning"
          description={
            summary
              ? `已付 ${summary.paid_orders} · 退款 ¥${Number(summary.refunded_orders_amount_yuan).toLocaleString()}`
              : '加载中…'
          }
        />
        <StatCard
          title="待支付订单"
          value={summary ? Number(summary.pending_orders).toLocaleString() : '—'}
          icon={CreditCard}
          iconAccent="rose"
          description="当前未付订单数"
        />
      </div>

      {/* 营收趋势 + 收入构成 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="近 12 个月营收趋势"
          description="订阅 + 充值 + 增值服务"
          icon={Wallet}
          iconAccent="success"
          loading={loading}
          isEmpty={!loading && monthlyRevenue.length === 0}
          className="lg:col-span-2"
          toolbar={
            <Button variant="ghost" size="sm" onClick={handleExportRevenue} className="gap-1 text-xs">
              <Download className="size-3" strokeWidth={2.25} />
              导出
            </Button>
          }
        >
          <BarChart
            data={monthlyRevenue.map((m) => ({
              month: m.month.slice(-5),
              营收: m.revenue,
            }))}
            xKey="month"
            series={[{ dataKey: '营收', color: 'success' }]}
            yFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`}
          />
        </ChartCard>

        <ChartCard
          title="本月收入构成"
          description={`${currentMonth.month || '—'} 收入分布`}
          icon={Coins}
          iconAccent="warning"
          loading={loading}
          isEmpty={!loading && pieData.length === 0}
        >
          <PieChart data={pieData} nameKey="name" valueKey="value" />
        </ChartCard>
      </div>

      {/* 占位卡片 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard title="租户积分消耗排行" description="租户维度的消耗明细" icon={Coins}>
          <EmptyState title="暂无排行数据" description="租户维度的消耗明细待接入后可在此展示" />
        </SectionCard>
        <SectionCard title="积分流水明细" description="租户维度积分增减" icon={Receipt}>
          <EmptyState title="暂无流水数据" description="后端 API 待开放" />
        </SectionCard>
      </div>

      {/* 导出报表 Modal */}
      <DetailModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        title="导出报表"
        description="选择要导出的报表类型，导出为 CSV 格式"
        size="md"
      >
        <button
          type="button"
          onClick={handleExportRevenue}
          className="card-hover flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-4 text-left"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wallet className="size-5" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">营收趋势报表</p>
            <p className="text-xs text-muted-foreground">
              近 {monthlyRevenue.length} 个月营收、订单数、分类收入明细
            </p>
          </div>
          <Download className="size-4 text-muted-foreground" strokeWidth={2.25} />
        </button>
      </DetailModal>
    </PageContainer>
  )
}
