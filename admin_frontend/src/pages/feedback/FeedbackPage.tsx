import * as React from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import {
  Bug,
  Inbox,
  Lightbulb,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  CircleCheck,
  Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PageContainer, PageHeader, StatCard } from '@/components/shared'
import {
  ButtonGroup,
  DataTable,
  DetailDrawer,
  FilterBar,
  ImageLightbox,
  ProFormField,
  SearchInput,
} from '@/components/admin'
import { usePagination } from '@/hooks/usePagination'
import { formatDate } from '@/lib/format'
import { ApiBusinessError } from '@/lib/api/schema'
import {
  fetchFeedbackList,
  fetchFeedbackOverview,
  patchFeedbackApi,
  type FeedbackOverview,
  type FeedbackRow,
} from '@/lib/api/feedback'

type StatusFilter = 'all' | 'pending' | 'resolved'

const CATEGORY_META: Record<FeedbackRow['category'], { label: string; icon: typeof Lightbulb; cls: string }> = {
  suggestion: { label: '功能建议', icon: Lightbulb, cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  bug: { label: '问题反馈', icon: Bug, cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  other: { label: '其他', icon: MoreHorizontal, cls: 'bg-muted text-muted-foreground' },
}

function StatusBadge({ status }: { status: FeedbackRow['status'] }) {
  return status === 'resolved' ? (
    <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
      已处理
    </Badge>
  ) : (
    <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">
      待处理
    </Badge>
  )
}

export default function FeedbackPage() {
  const pagination = usePagination({ page: 1, pageSize: 20 })
  const { page, pageSize, total, setPage, setTotal } = pagination

  const [overview, setOverview] = React.useState<FeedbackOverview | null>(null)
  const [rows, setRows] = React.useState<FeedbackRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [appliedSearch, setAppliedSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all')

  // 详情抽屉
  const [selected, setSelected] = React.useState<FeedbackRow | null>(null)
  const [editStatus, setEditStatus] = React.useState<FeedbackRow['status']>('pending')
  const [editReply, setEditReply] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // 图片放大：记录起始索引（null = 关闭）
  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [ov, list] = await Promise.all([
        fetchFeedbackOverview(),
        fetchFeedbackList({
          page,
          pageSize,
          status: statusFilter === 'all' ? undefined : statusFilter,
          search: appliedSearch || undefined,
        }),
      ])
      setOverview(ov)
      setRows(list.items)
      setTotal(list.total)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('反馈列表加载失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter, appliedSearch, setTotal])

  React.useEffect(() => {
    void load()
  }, [load])

  const openDetail = (r: FeedbackRow) => {
    setSelected(r)
    setEditStatus(r.status)
    setEditReply(r.reply ?? '')
  }

  const dirty = selected
    ? editStatus !== selected.status || editReply.trim() !== (selected.reply ?? '').trim()
    : false

  const handleSave = async () => {
    if (!selected || !dirty) return
    setSaving(true)
    try {
      const updated = await patchFeedbackApi(selected.id, {
        status: editStatus,
        reply: editReply.trim(),
      })
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      setSelected(updated)
      // 概览计数可能变化，刷新一次
      void fetchFeedbackOverview().then(setOverview).catch(() => {})
      toast.success('已保存')
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const columns = React.useMemo<ColumnDef<FeedbackRow, unknown>[]>(
    () => [
      {
        header: '用户',
        accessorKey: 'userName',
        size: 160,
        cell: ({ row }) => {
          const r = row.original
          const sub = r.userEmail || (r.userPhoneTail ? `****${r.userPhoneTail}` : r.userId.slice(0, 8))
          return (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{r.userName || '未命名'}</p>
              <p className="truncate text-xs text-muted-foreground">{sub}</p>
            </div>
          )
        },
      },
      {
        header: '类型',
        accessorKey: 'category',
        size: 100,
        cell: ({ row }) => {
          const m = CATEGORY_META[row.original.category]
          return <Badge className={m.cls}>{m.label}</Badge>
        },
      },
      {
        header: '内容',
        accessorKey: 'content',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <p className="line-clamp-2 max-w-md text-sm text-foreground">{row.original.content}</p>
            {row.original.images.length > 0 && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {row.original.images.length} 图
              </span>
            )}
          </div>
        ),
      },
      {
        header: '状态',
        accessorKey: 'status',
        size: 90,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        header: '提交时间',
        accessorKey: 'createdAt',
        size: 150,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span>
        ),
      },
    ],
    [],
  )

  return (
    <PageContainer>
      <PageHeader
        title="用户反馈"
        description="查看并处理用户提交的功能建议与问题反馈"
        icon={MessageSquare}
        iconAccent="primary"
        breadcrumbs={[{ label: '平台运营' }, { label: '用户反馈' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
            ) : (
              <RefreshCw className="size-3.5" strokeWidth={2.25} />
            )}
            刷新
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="累计反馈" value={overview?.total ?? 0} icon={Inbox} iconAccent="primary" />
        <StatCard title="待处理" value={overview?.pending ?? 0} icon={Clock} iconAccent="warning" />
        <StatCard title="已处理" value={overview?.resolved ?? 0} icon={CircleCheck} iconAccent="success" />
      </div>

      <div className="mt-4">
        <FilterBar
          search={
            <SearchInput
              value={search}
              onChange={setSearch}
              onDebouncedChange={(v) => {
                setAppliedSearch(v.trim())
                setPage(1)
              }}
              onSubmit={(v) => {
                setAppliedSearch(v.trim())
                setPage(1)
              }}
              placeholder="搜索反馈内容 / 联系方式…"
            />
          }
          filters={
            <ButtonGroup
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v)
                setPage(1)
              }}
              options={[
                { value: 'all', label: '全部' },
                { value: 'pending', label: '待处理' },
                { value: 'resolved', label: '已处理' },
              ]}
              size="sm"
            />
          }
        />
        <div className="mt-3">
          <DataTable
            columns={columns}
            data={rows}
            loading={loading}
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            rowKey={(r) => r.id}
            onRowClick={openDetail}
          />
        </div>
      </div>

      {/* 详情 + 处理 Drawer */}
      <DetailDrawer
        open={!!selected}
        onOpenChange={(o) => !saving && !o && setSelected(null)}
        lockClose={previewIndex !== null}
        title="反馈详情"
        description={selected ? `${CATEGORY_META[selected.category].label} · ${formatDate(selected.createdAt)}` : undefined}
        width="lg"
        footer={
          selected ? (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelected(null)} disabled={saving}>
                关闭
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving || !dirty}>
                {saving && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
                保存处理
              </Button>
            </div>
          ) : null
        }
      >
        {selected && (
          <div className="space-y-5">
            {/* 提交人 */}
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">{selected.userName || '未命名'}</span>
                <StatusBadge status={selected.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {selected.userEmail || (selected.userPhoneTail ? `手机尾号 ${selected.userPhoneTail}` : selected.userId)}
              </p>
              {selected.contact && (
                <p className="mt-1 text-xs text-muted-foreground">联系方式：{selected.contact}</p>
              )}
            </div>

            {/* 内容 */}
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">反馈内容</p>
              <p className="whitespace-pre-wrap break-words text-sm text-foreground">{selected.content}</p>
            </div>

            {/* 图片 */}
            {selected.images.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">截图</p>
                <div className="flex flex-wrap gap-2">
                  {selected.images.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setPreviewIndex(i)}
                      className="size-24 cursor-pointer overflow-hidden rounded-lg border border-border bg-muted/30 transition hover:border-primary"
                    >
                      <img src={url} alt="" className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 处理 */}
            <div className="space-y-4 rounded-lg border border-border p-4">
              <ProFormField label="处理状态">
                <ButtonGroup
                  value={editStatus}
                  onChange={(v) => setEditStatus(v)}
                  options={[
                    { value: 'pending', label: '待处理' },
                    { value: 'resolved', label: '已处理' },
                  ]}
                  size="sm"
                />
              </ProFormField>
              <ProFormField label="回复内容" hint="保存后用户可在「我的反馈」中看到该回复">
                <Textarea
                  value={editReply}
                  onChange={(e) => setEditReply(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  placeholder="给用户的回复（可选）"
                />
              </ProFormField>
            </div>
          </div>
        )}
      </DetailDrawer>

      {/* 图片灯箱（缩放 / 平移 / 左右切换 / 下载）。打开时 Drawer lockClose，避免一起被关 */}
      {previewIndex !== null && selected && selected.images.length > 0 && (
        <ImageLightbox
          images={selected.images}
          startIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </PageContainer>
  )
}
