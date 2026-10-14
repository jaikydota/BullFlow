import { ButtonGroup } from '@/components/admin'
import type { RangeKey } from '@/lib/api/tracking'

export type RangeState = { range: RangeKey; start?: string; end?: string }

const OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: 'today', label: '今日' },
  { value: 'yesterday', label: '昨日' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: 'custom', label: '自定义' },
]

const dateInputCls =
  'rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground outline-none focus:border-primary/50'

/** 数据分析各页共用的时间范围筛选（预设 + 自定义起止日期）。 */
export function TimeRangeFilter({
  value,
  onChange,
}: {
  value: RangeState
  onChange: (v: RangeState) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ButtonGroup<RangeKey>
        options={OPTIONS}
        value={value.range}
        onChange={(r) => onChange({ ...value, range: r })}
        size="sm"
      />
      {value.range === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value.start ?? ''}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
            className={dateInputCls}
          />
          <span className="text-sm text-muted-foreground">至</span>
          <input
            type="date"
            value={value.end ?? ''}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            className={dateInputCls}
          />
        </div>
      )}
    </div>
  )
}
