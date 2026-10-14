import * as React from 'react'
import { Copy, Link2, Loader2, RefreshCw, TrendingUp, Users2, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/shared'
import { ChartCard, LineChart } from '@/components/admin'
import { ApiBusinessError } from '@/lib/api/schema'
import {
  fetchSalesMe,
  fetchSalesMeReferrals,
  referralUrl,
  type SalesReferral,
  type SalesSelf,
} from '@/lib/api/sales'

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label}已复制`),
    () => toast.error('复制失败，请手动复制'),
  )
}

export default function SalesDashboardPage() {
  const [me, setMe] = React.useState<SalesSelf | null>(null)
  const [refs, setRefs] = React.useState<SalesReferral[]>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [m, r] = await Promise.all([fetchSalesMe(), fetchSalesMeReferrals(1, 50)])
      setMe(m)
      setRefs(r.items ?? [])
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('看板加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const code = me?.invitationCode ?? ''
  const url = code ? referralUrl(code) : ''

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            我的引流看板{me?.nickname ? ` · ${me.nickname}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">分享你的专属链接，注册用户将自动归因到你名下</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
          ) : (
            <RefreshCw className="size-3.5" strokeWidth={2.25} />
          )}
          刷新
        </Button>
      </div>

      {/* 专属邀请码 + 引流链接 */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">我的邀请码</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-2xl font-bold tracking-wide text-foreground">
                {code || '—'}
              </span>
              {code && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="复制邀请码"
                  onClick={() => copy(code, '邀请码')}
                >
                  <Copy className="size-4" strokeWidth={2.25} />
                </Button>
              )}
            </div>
          </div>
          {code && (
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">引流链接</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
                  {url}
                </code>
                <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => copy(url, '引流链接')}>
                  <Link2 className="size-3.5" strokeWidth={2.25} />
                  复制链接
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 统计卡 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="引流用户" value={me?.referredCount ?? 0} icon={Users2} iconAccent="info" />
        <StatCard title="付费用户" value={me?.paidCount ?? 0} icon={TrendingUp} iconAccent="success" />
        <StatCard
          title="贡献营收"
          value={`¥${(me?.revenueYuan ?? 0).toLocaleString()}`}
          icon={Wallet}
          iconAccent="warning"
        />
      </div>

      {/* 趋势 */}
      <ChartCard
        title="近 30 天引流注册趋势"
        icon={TrendingUp}
        loading={loading}
        isEmpty={!me?.trend.length}
      >
        <LineChart
          data={me?.trend ?? []}
          xKey="date"
          series={[{ dataKey: 'count', label: '引流注册', color: 'primary' }]}
        />
      </ChartCard>

      {/* 引流用户列表 */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-foreground">引流用户</h2>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" strokeWidth={2.25} /> 加载中…
          </div>
        ) : refs.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">还没有引流用户，快去分享你的链接吧</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">用户</th>
                  <th className="px-2 py-2 font-medium">手机尾号</th>
                  <th className="px-2 py-2 font-medium">当前套餐</th>
                  <th className="px-2 py-2 font-medium">付费</th>
                  <th className="px-2 py-2 font-medium">注册时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {refs.map((u) => (
                  <tr key={u.id}>
                    <td className="px-2 py-2 text-foreground">{u.nickname || '—'}</td>
                    <td className="px-2 py-2 font-mono text-xs text-muted-foreground">
                      {u.phoneTail ? `****${u.phoneTail}` : '—'}
                    </td>
                    <td className="px-2 py-2">{u.planSlug ?? '—'}</td>
                    <td className="px-2 py-2">
                      {u.paid ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
                          已付费
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {u.createdAt?.replace('T', ' ').slice(0, 16) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
