import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ListTree } from 'lucide-react'
import toast from 'react-hot-toast'

import { PageContainer, PageHeader } from '@/components/shared'
import { DataTable, FilterBar, SearchInput } from '@/components/admin'
import { EVENT_OPTIONS, fetchTrackingEvents, type TrackingEvent } from '@/lib/api/tracking'
import { TimeRangeFilter, type RangeState } from './TimeRangeFilter'

const PAGE_SIZE = 20

function labelOf(ev: string): string {
  return EVENT_OPTIONS.find((o) => o.value === ev)?.label ?? ev
}

export default function TrackingEventsPage() {
  const [range, setRange] = React.useState<RangeState>({ range: '7d' })
  const [eventName, setEventName] = React.useState('')
  const [userInput, setUserInput] = React.useState('')
  const [appliedUser, setAppliedUser] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [rows, setRows] = React.useState<TrackingEvent[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchTrackingEvents({
        ...range,
        event_name: eventName || undefined,
        user_id: appliedUser || undefined,
        page,
        page_size: PAGE_SIZE,
      })
      setRows(res.items)
      setTotal(res.total)
    } catch {
      toast.error('加载事件明细失败')
    } finally {
      setLoading(false)
    }
  }, [range, eventName, appliedUser, page])

  React.useEffect(() => {
    load()
  }, [load])

  // 筛选变化回到第 1 页
  React.useEffect(() => {
    setPage(1)
  }, [range, eventName, appliedUser])

  const columns: ColumnDef<TrackingEvent>[] = [
    {
      accessorKey: 'event_name',
      header: '事件名',
      cell: ({ row }) => <span className="font-medium text-foreground">{labelOf(row.original.event_name)}</span>,
    },
    {
      accessorKey: 'user_id',
      header: '用户 ID',
      cell: ({ row }) =>
        row.original.user_id ? (
          <span className="font-mono text-xs">{row.original.user_id}</span>
        ) : (
          <span className="text-muted-foreground">匿名</span>
        ),
    },
    {
      accessorKey: 'visitor_id',
      header: '访客 ID',
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.visitor_id}</span>,
    },
    {
      accessorKey: 'page_url',
      header: '页面',
      cell: ({ row }) => (
        <span className="inline-block max-w-[200px] truncate align-middle text-xs">
          {row.original.page_url ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: '时间',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {new Date(row.original.created_at).toLocaleString('zh-CN')}
        </span>
      ),
    },
    {
      accessorKey: 'properties',
      header: '详情',
      cell: ({ row }) =>
        row.original.properties ? (
          <code className="inline-block max-w-[260px] truncate align-middle text-xs text-muted-foreground">
            {JSON.stringify(row.original.properties)}
          </code>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title="事件明细"
        description="埋点原始事件流水，支持事件名 / 用户 ID / 时间范围筛选，用于排查问题"
        icon={ListTree}
        iconAccent="primary"
      />

      <div className="mt-4">
        <TimeRangeFilter value={range} onChange={setRange} />
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          rowKey={(r) => r.id}
          toolbar={
            <FilterBar
              search={
                <SearchInput
                  value={userInput}
                  onChange={setUserInput}
                  onDebouncedChange={setAppliedUser}
                  placeholder="按用户 ID 搜索"
                />
              }
              filters={
                <select
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="cursor-pointer rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
                >
                  <option value="">全部事件</option>
                  {EVENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              }
            />
          }
        />
      </div>
    </PageContainer>
  )
}
