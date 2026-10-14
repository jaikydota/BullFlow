import { useEffect, useState } from 'react'
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * 带边框、整块可点的日期时间选择器（替代原生 <input type="datetime-local">）。
 * - value / onChange / min / max 均用本地串 "YYYY-MM-DDTHH:mm"（与原生 datetime-local 一致）。
 * - 自绘月历（无第三方依赖）+ 原生 <select> 选时分（放在 Popover DOM 内，不会触发 Popover 关闭）。
 */

interface Props {
  value: string
  onChange: (v: string) => void
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const pad = (n: number) => String(n).padStart(2, '0')

function parseLocal(s?: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}
function fmtValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fmtDisplay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function DateTimePicker({ value, onChange, min, max, placeholder = '选择日期时间', disabled }: Props) {
  const minD = parseLocal(min) ?? undefined
  const maxD = parseLocal(max) ?? undefined
  const selected = parseLocal(value)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<Date>(() => startOfMonth(selected ?? minD ?? new Date()))

  // 每次打开把视图对齐到已选值 / 最小可选月
  useEffect(() => {
    if (open) setView(startOfMonth(parseLocal(value) ?? minD ?? new Date()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const curHour = selected ? selected.getHours() : (minD ? minD.getHours() : 9)
  const curMin = selected ? selected.getMinutes() : 0

  const clamp = (d: Date) => {
    if (minD && d < minD) return new Date(minD)
    if (maxD && d > maxD) return new Date(maxD)
    return d
  }
  const emit = (d: Date) => onChange(fmtValue(clamp(d)))

  const pickDay = (day: Date) => {
    emit(new Date(day.getFullYear(), day.getMonth(), day.getDate(), curHour, curMin, 0, 0))
  }
  const setTime = (h: number, m: number) => {
    const base = selected ?? minD ?? new Date()
    emit(new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0))
  }

  const dayDisabled = (day: Date) => {
    const end = new Date(day); end.setHours(23, 59, 59, 999)
    const start = new Date(day); start.setHours(0, 0, 0, 0)
    if (minD && end < minD) return true
    if (maxD && start > maxD) return true
    return false
  }

  const first = startOfMonth(view)
  const gridStart = addDays(first, -first.getDay())
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const today = new Date()
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const minutes = Array.from({ length: 60 }, (_, i) => i)

  const selectCls = 'h-8 cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors hover:border-ring/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
            !value && 'text-muted-foreground',
          )}
        >
          <span>{selected ? fmtDisplay(selected) : placeholder}</span>
          <CalendarIcon className="size-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-3">
        {/* 月份导航 */}
        <div className="flex items-center justify-between px-1 pb-2">
          <button type="button" aria-label="上个月" className="cursor-pointer rounded-md p-1 hover:bg-accent" onClick={() => setView(addMonths(view, -1))}>
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-medium">{view.getFullYear()} 年 {view.getMonth() + 1} 月</span>
          <button type="button" aria-label="下个月" className="cursor-pointer rounded-md p-1 hover:bg-accent" onClick={() => setView(addMonths(view, 1))}>
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* 星期 */}
        <div className="grid grid-cols-7 gap-0.5 px-1 text-center text-[11px] text-muted-foreground">
          {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
        </div>

        {/* 日期格 */}
        <div className="grid grid-cols-7 gap-0.5 px-1">
          {days.map((d, i) => {
            const inMonth = d.getMonth() === view.getMonth()
            const isSel = selected != null && sameDay(d, selected)
            const isToday = sameDay(d, today)
            const dis = dayDisabled(d)
            return (
              <button
                key={i}
                type="button"
                disabled={dis}
                onClick={() => pickDay(d)}
                className={cn(
                  'h-8 w-8 rounded-md text-sm transition-colors',
                  !dis && 'cursor-pointer',
                  !inMonth && 'text-muted-foreground/40',
                  inMonth && !isSel && !dis && 'hover:bg-accent',
                  isSel && 'bg-primary text-primary-foreground hover:bg-primary',
                  isToday && !isSel && 'ring-1 ring-primary/40',
                  dis && 'cursor-not-allowed opacity-30',
                )}
              >
                {d.getDate()}
              </button>
            )
          })}
        </div>

        {/* 时间 + 操作 */}
        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          <Clock className="size-4 shrink-0 text-muted-foreground" />
          <select className={selectCls} value={curHour} onChange={(e) => setTime(Number(e.target.value), curMin)}>
            {hours.map((h) => <option key={h} value={h}>{pad(h)} 时</option>)}
          </select>
          <span className="text-muted-foreground">:</span>
          <select className={selectCls} value={curMin} onChange={(e) => setTime(curHour, Number(e.target.value))}>
            {minutes.map((m) => <option key={m} value={m}>{pad(m)} 分</option>)}
          </select>
          <div className="ml-auto flex gap-1">
            {value && (
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => onChange('')}>
                清除
              </Button>
            )}
            <Button type="button" size="sm" className="h-8 px-3 text-xs" onClick={() => setOpen(false)}>
              完成
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
