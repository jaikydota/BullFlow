/**
 * 图表组件薄包装，统一 OKLCH token 配色 + tooltip 样式
 * recharts 数据 schema 由调用方决定，此处仅渲染层
 */
import {
  Bar,
  BarChart as RcBarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as RcLineChart,
  Pie,
  PieChart as RcPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/** OKLCH 配色槽位（来自 frontend index.css 主题 token） */
export const CHART_COLORS = {
  primary: 'oklch(0.55 0.25 285)',
  article: 'oklch(0.55 0.2 262)',
  image: 'oklch(0.65 0.18 145)',
  video: 'oklch(0.6 0.22 15)',
  audio: 'oklch(0.65 0.15 230)',
  success: 'oklch(0.6 0.18 145)',
  warning: 'oklch(0.65 0.16 50)',
  destructive: 'oklch(0.55 0.2 25)',
  muted: 'oklch(0.65 0.01 260)',
} as const

export type ChartColorKey = keyof typeof CHART_COLORS

const CHART_PALETTE: string[] = [
  CHART_COLORS.primary,
  CHART_COLORS.article,
  CHART_COLORS.image,
  CHART_COLORS.video,
  CHART_COLORS.audio,
  CHART_COLORS.warning,
]

const tooltipStyle: React.CSSProperties = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  boxShadow: 'var(--shadow-pop)',
  padding: '8px 10px',
  color: 'var(--popover-foreground)',
}

const axisStyle = {
  fontSize: 11,
  fill: 'var(--muted-foreground)',
}

// ─────────────── LineChart ───────────────
export type LineChartSeries = {
  dataKey: string
  label?: string
  color?: ChartColorKey | string
}

export type LineChartProps<T extends Record<string, unknown>> = {
  data: T[]
  xKey: string
  series: LineChartSeries[]
  showLegend?: boolean
  yFormatter?: (v: number) => string
}

export function LineChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  showLegend = true,
  yFormatter,
}: LineChartProps<T>) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RcLineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} tick={axisStyle} stroke="var(--border)" />
        <YAxis tick={axisStyle} stroke="var(--border)" tickFormatter={yFormatter} />
        <Tooltip contentStyle={tooltipStyle} formatter={yFormatter as any} />
        {showLegend && (
          <Legend
            verticalAlign="top"
            height={28}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: 'var(--muted-foreground)' }}
          />
        )}
        {series.map((s, i) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.label ?? s.dataKey}
            stroke={
              s.color && s.color in CHART_COLORS
                ? CHART_COLORS[s.color as ChartColorKey]
                : (s.color as string) || CHART_PALETTE[i % CHART_PALETTE.length]
            }
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </RcLineChart>
    </ResponsiveContainer>
  )
}

// ─────────────── BarChart ───────────────
export type BarChartSeries = {
  dataKey: string
  label?: string
  color?: ChartColorKey | string
}

export type BarChartProps<T extends Record<string, unknown>> = {
  data: T[]
  xKey: string
  series: BarChartSeries[]
  stacked?: boolean
  showLegend?: boolean
  yFormatter?: (v: number) => string
}

export function BarChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  stacked,
  showLegend = true,
  yFormatter,
}: BarChartProps<T>) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RcBarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} tick={axisStyle} stroke="var(--border)" />
        <YAxis tick={axisStyle} stroke="var(--border)" tickFormatter={yFormatter} />
        <Tooltip contentStyle={tooltipStyle} formatter={yFormatter as any} />
        {showLegend && (
          <Legend
            verticalAlign="top"
            height={28}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: 'var(--muted-foreground)' }}
          />
        )}
        {series.map((s, i) => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.label ?? s.dataKey}
            stackId={stacked ? 'stack' : undefined}
            fill={
              s.color && s.color in CHART_COLORS
                ? CHART_COLORS[s.color as ChartColorKey]
                : (s.color as string) || CHART_PALETTE[i % CHART_PALETTE.length]
            }
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
        ))}
      </RcBarChart>
    </ResponsiveContainer>
  )
}

// ─────────────── PieChart ───────────────
export type PieChartProps<T extends Record<string, unknown>> = {
  data: T[]
  nameKey: string
  valueKey: string
  /** 内置环形（donut）模式：默认 true */
  donut?: boolean
  showLegend?: boolean
}

export function PieChart<T extends Record<string, unknown>>({
  data,
  nameKey,
  valueKey,
  donut = true,
  showLegend = true,
}: PieChartProps<T>) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RcPieChart>
        <Tooltip contentStyle={tooltipStyle} />
        {showLegend && (
          <Legend
            verticalAlign="bottom"
            height={28}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: 'var(--muted-foreground)' }}
          />
        )}
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          cx="50%"
          cy="50%"
          innerRadius={donut ? 55 : 0}
          outerRadius={80}
          paddingAngle={donut ? 2 : 0}
          stroke="var(--card)"
          strokeWidth={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Pie>
      </RcPieChart>
    </ResponsiveContainer>
  )
}
