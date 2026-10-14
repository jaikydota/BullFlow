import * as React from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Loader2, RefreshCw, ScrollText } from 'lucide-react'
import toast from 'react-hot-toast'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageContainer, PageHeader } from '@/components/shared'
import {
  DataTable,
  DetailModal,
  FilterBar,
  SearchInput,
} from '@/components/admin'
import { fetchAuditLogs, type AuditLogRow } from '@/lib/api/saas'
import { ApiBusinessError } from '@/lib/api/schema'
import { usePagination } from '@/hooks/usePagination'

function detailPreview(detail: unknown): string {
  if (detail == null) return '—'
  try {
    return JSON.stringify(detail, null, 2)
  } catch {
    return String(detail)
  }
}

export default function LogsPage() {
  const pagination = usePagination({ page: 1, pageSize: 20 })
  const { page, pageSize, setPage, setTotal } = pagination

  const [searchInput, setSearchInput] = React.useState('')
  const [appliedQuery, setAppliedQuery] = React.useState('')
  const [items, setItems] = React.useState<AuditLogRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [selected, setSelected] = React.useState<AuditLogRow | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAuditLogs({
        page,
        page_size: pageSize,
        search: appliedQuery || undefined,
      })
      setItems(data.items ?? [])
      setTotal(data.total)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('操作日志加载失败')
    } finally {
      setLoading(false)
    }
  }, [appliedQuery, page, pageSize, setTotal])

  React.useEffect(() => {
    load()
  }, [load])

  const columns = React.useMemo<ColumnDef<AuditLogRow, unknown>[]>(
    () => [
      {
        header: '时间',
        accessorKey: 'createdAt',
        size: 180,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.createdAt}</span>
        ),
      },
      {
        header: '操作',
        accessorKey: 'action',
        cell: ({ row }) => (
          <span className="text-sm font-medium text-foreground">{row.original.action}</span>
        ),
      },
      {
        header: '资源',
        accessorKey: 'resourceType',
        cell: ({ row }) => (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{row.original.resourceType ?? '—'}</span>
            {row.original.resourceId && (
              <Badge variant="outline" className="text-[10px]">
                {row.original.resourceId}
              </Badge>
            )}
          </div>
        ),
      },
      {
        header: '操作人',
        accessorKey: 'operatorUserId',
        cell: ({ row }) => (
          <span className="truncate font-mono text-xs text-muted-foreground">
            {row.original.operatorUserId ?? '—'}
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <PageContainer>
      <PageHeader
        title="操作日志"
        description="平台操作与关键配置变更的记录查询"
        icon={ScrollText}
        iconAccent="neutral"
        breadcrumbs={[{ label: '资源运维' }, { label: '操作日志' }]}
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

      <FilterBar
        search={
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            onSubmit={(v) => {
              setAppliedQuery(v.trim())
              setPage(1)
            }}
            onDebouncedChange={(v) => {
              setAppliedQuery(v.trim())
              setPage(1)
            }}
            placeholder="搜索 action / 资源类型…"
          />
        }
      />

      <div className="mt-3">
        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          total={pagination.total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          rowKey={(r) => r.id}
          onRowClick={setSelected}
        />
      </div>

      <DetailModal
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        title="审计详情"
        size="lg"
      >
        {selected && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-1.5 rounded-lg border border-border bg-muted/20 p-3 text-xs">
              <p>
                <span className="text-muted-foreground">时间 · </span>
                {selected.createdAt}
              </p>
              <p>
                <span className="text-muted-foreground">action · </span>
                <span className="font-medium text-foreground">{selected.action}</span>
              </p>
              <p>
                <span className="text-muted-foreground">resourceType · </span>
                {selected.resourceType ?? '—'}
              </p>
              <p className="break-all font-mono">
                <span className="text-muted-foreground">resourceId · </span>
                {selected.resourceId ?? '—'}
              </p>
              <p className="break-all font-mono">
                <span className="text-muted-foreground">operator · </span>
                {selected.operatorUserId ?? '—'}
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">detail JSON</p>
              <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
                {detailPreview(selected.detail)}
              </pre>
            </div>
          </div>
        )}
      </DetailModal>
    </PageContainer>
  )
}
