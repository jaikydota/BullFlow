import { useCallback, useEffect, useState, type ReactElement } from 'react'
import {
  Activity,
  BarChart3,
  Boxes,
  PieChart as PieChartIcon,
  Send,
  Sparkles,
  UploadCloud,
  Users,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { GradientHero, PageContainer, PageHeader, SectionCard, StatCard } from '@/components/shared'
import { dashboardApi, type DashboardAnalytics } from '@/api/dashboard'
import { toast } from '@/components/common/Toast'
import { ApiError } from '@/types/api'
import { formatFileSize } from '@/utils/format'
import { getPlatformName } from '@/utils/tlfPlatforms'
import { cn } from '@/lib/utils'

// 内容语义色（与全站统一，不可换色）
const COLOR = {
  article: 'var(--content-article)', // 文章 蓝
  image: 'var(--content-image)', // 图片 emerald
  video: 'var(--content-video)', // 视频 rose
  audio: 'var(--content-audio)', // 音频 sky
  primary: 'var(--primary)', // 紫
}
const PALETTE = [
  COLOR.primary,
  COLOR.article,
  COLOR.image,
  COLOR.video,
  COLOR.audio,
  '#f59e0b',
  '#06b6d4',
  '#ec4899',
]

const TYPE_LABEL: Record<string, string> = { article: '文章', image: '图片', video: '视频' }

const tickStyle = { fill: 'var(--muted-foreground)', fontSize: 11 } as const
const tooltipStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  fontSize: 12,
  color: 'var(--foreground)',
  boxShadow: '0 8px 30px rgba(0,0,0,0.10)',
} as const
const tooltipLabelStyle = { color: 'var(--muted-foreground)', marginBottom: 4 } as const

const fmtDay = (d: string) => d.slice(5) // YYYY-MM-DD → MM-DD

const DAY_OPTIONS = [7, 30, 90] as const

function ChartBox({ children, empty }: { children: ReactElement; empty?: boolean }) {
  if (empty) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        暂无数据
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      {children}
    </ResponsiveContainer>
  )
}

export default function ReviewDashboardPage() {
  const [days, setDays] = useState<number>(30)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardAnalytics | null>(null)

  const load = useCallback(async (d: number) => {
    setLoading(true)
    try {
      const res = await dashboardApi.analytics(d)
      setData(res)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(days)
  }, [days, load])

  const t = data?.totals
  const uploadHasData = (data?.uploadTrend ?? []).some(
    (p) => p.documents + p.images + p.videos + p.audios > 0,
  )
  const activityHasData = (data?.activityTrend ?? []).some(
    (p) => p.generations + p.messages + p.publishes > 0,
  )

  const typePieData = (data?.generationByType ?? []).map((d) => ({
    name: TYPE_LABEL[d.key] ?? d.key,
    value: d.count,
    color: COLOR[d.key as keyof typeof COLOR] ?? COLOR.primary,
  }))
  const publishBarData = (data?.publishByPlatform ?? []).map((d) => ({
    name: getPlatformName(d.platform),
    成功: d.success,
    失败: d.failed,
  }))
  const accountBarData = (data?.accountsByPlatform ?? []).map((d) => ({
    name: getPlatformName(d.platform),
    count: d.count,
  }))

  return (
    <PageContainer size="xl">
      <PageHeader
        title="数据仪表板"
        description="上传、创作、发布、对话与社媒账号的全维度数据概览"
        icon={BarChart3}
        iconAccent="info"
        breadcrumbs={[{ label: '数据分析' }, { label: '数据仪表板' }]}
        actions={
          <div className="inline-flex items-center rounded-lg border border-border bg-card p-0.5 shadow-xs">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={cn(
                  'cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  days === d
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                近 {d} 天
              </button>
            ))}
          </div>
        }
      />

      <div className="space-y-6">
        <GradientHero
          tone="ocean"
          eyebrow={`近 ${days} 天`}
          title="数据增长一目了然"
          description="覆盖内容资产、AI 创作、多平台发布、智能对话与社媒账号矩阵"
        />

        {/* ── 总量卡片 ── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="上传文件"
            value={loading ? '—' : (t?.uploads ?? 0)}
            icon={UploadCloud}
            iconAccent="image"
            description={
              loading
                ? undefined
                : `存储占用 ${formatFileSize(t?.storageBytes ?? 0)} · 文档 ${t?.documents ?? 0}/图 ${t?.images ?? 0}/视频 ${t?.videos ?? 0}/音频 ${t?.audios ?? 0}`
            }
          />
          <StatCard
            title="AI 生成内容"
            value={loading ? '—' : (t?.generations ?? 0)}
            icon={Sparkles}
            iconAccent="primary"
            description={loading ? undefined : '文章 / 图片 / 视频累计'}
          />
          <StatCard
            title="发布任务"
            value={loading ? '—' : (t?.publishTasks ?? 0)}
            icon={Send}
            iconAccent="video"
            description={loading ? undefined : '提交到各平台的分发任务'}
          />
          <StatCard
            title="社媒账号"
            value={loading ? '—' : (t?.socialAccounts ?? 0)}
            icon={Users}
            iconAccent="success"
            description={
              loading ? undefined : `对话 ${t?.chats ?? 0} 次 · 消息 ${t?.messages ?? 0} 条`
            }
          />
        </div>

        {/* ── 上传趋势 ── */}
        <SectionCard
          icon={Boxes}
          iconAccent="image"
          title="内容上传趋势"
          description={`近 ${days} 天文档 / 图片 / 视频 / 音频的上传量`}
          variant="elevated"
        >
          <ChartBox empty={!loading && !uploadHasData}>
            <AreaChart data={data?.uploadTrend ?? []} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <defs>
                {(['article', 'image', 'video', 'audio'] as const).map((k) => (
                  <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR[k]} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={COLOR[k]} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} tick={tickStyle} stroke="var(--border)" minTickGap={24} />
              <YAxis allowDecimals={false} tick={tickStyle} stroke="var(--border)" width={32} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="documents" name="文档" stackId="u" stroke={COLOR.article} fill="url(#grad-article)" strokeWidth={2} />
              <Area type="monotone" dataKey="images" name="图片" stackId="u" stroke={COLOR.image} fill="url(#grad-image)" strokeWidth={2} />
              <Area type="monotone" dataKey="videos" name="视频" stackId="u" stroke={COLOR.video} fill="url(#grad-video)" strokeWidth={2} />
              <Area type="monotone" dataKey="audios" name="音频" stackId="u" stroke={COLOR.audio} fill="url(#grad-audio)" strokeWidth={2} />
            </AreaChart>
          </ChartBox>
        </SectionCard>

        {/* ── 创作互动趋势 + 生成类型分布 ── */}
        <div className="grid gap-6 lg:grid-cols-3">
          <SectionCard
            className="lg:col-span-2"
            icon={Activity}
            iconAccent="primary"
            title="创作与互动趋势"
            description={`近 ${days} 天 AI 生成 / 对话消息 / 发布任务`}
            variant="elevated"
          >
            <ChartBox empty={!loading && !activityHasData}>
              <LineChart data={data?.activityTrend ?? []} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} tick={tickStyle} stroke="var(--border)" minTickGap={24} />
                <YAxis allowDecimals={false} tick={tickStyle} stroke="var(--border)" width={32} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="generations" name="AI 生成" stroke={COLOR.primary} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="messages" name="对话消息" stroke={COLOR.audio} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="publishes" name="发布任务" stroke={COLOR.video} strokeWidth={2} dot={false} />
              </LineChart>
            </ChartBox>
          </SectionCard>

          <SectionCard
            icon={PieChartIcon}
            iconAccent="primary"
            title="生成内容类型"
            description="按文章 / 图片 / 视频分布"
            variant="elevated"
          >
            <ChartBox empty={!loading && typePieData.length === 0}>
              <PieChart>
                <Pie
                  data={typePieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {typePieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="var(--card)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ChartBox>
          </SectionCard>
        </div>

        {/* ── 平台发布统计 + 社媒账号分布 ── */}
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            icon={Send}
            iconAccent="video"
            title="平台发布统计"
            description="各平台累计发布成功 / 失败账号次数"
            variant="elevated"
          >
            <ChartBox empty={!loading && publishBarData.length === 0}>
              <BarChart data={publishBarData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={tickStyle} stroke="var(--border)" />
                <YAxis allowDecimals={false} tick={tickStyle} stroke="var(--border)" width={32} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="成功" stackId="p" fill={COLOR.image} radius={[0, 0, 0, 0]} />
                <Bar dataKey="失败" stackId="p" fill={COLOR.video} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartBox>
          </SectionCard>

          <SectionCard
            icon={Users}
            iconAccent="success"
            title="社媒账号分布"
            description="已授权账号按平台分布"
            variant="elevated"
          >
            <ChartBox empty={!loading && accountBarData.length === 0}>
              <BarChart data={accountBarData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={tickStyle} stroke="var(--border)" />
                <YAxis allowDecimals={false} tick={tickStyle} stroke="var(--border)" width={32} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
                <Bar dataKey="count" name="账号数" radius={[4, 4, 0, 0]}>
                  {accountBarData.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartBox>
          </SectionCard>
        </div>
      </div>
    </PageContainer>
  )
}
