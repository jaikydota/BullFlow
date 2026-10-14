import * as React from 'react'
import {
  type ColumnDef,
  type Row,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/shared'

export type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  loading?: boolean
  /** 服务端总数（用于分页） */
  total?: number
  page?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (size: number) => void
  /** 行 key 提取器（默认用 id 字段） */
  rowKey?: (row: TData, index: number) => string | number
  /** 行点击事件 */
  onRowClick?: (row: TData) => void
  /** 是否启用多选 */
  enableRowSelection?: boolean
  /** 多选状态变化回调 */
  onRowSelectionChange?: (selectedRows: TData[]) => void
  /** 顶部工具栏（FilterBar 等） */
  toolbar?: React.ReactNode
  /** 批量操作区，仅在勾选行 > 0 时显示 */
  bulkActions?: (selectedRows: TData[]) => React.ReactNode
  /** 自定义空态 */
  empty?: React.ReactNode
  size?: 'sm' | 'md'
  /** 斑马纹（默认开） */
  zebra?: boolean
  /** sticky thead（默认开） */
  stickyHeader?: boolean
  /** 容器最大高度（用于 sticky 滚动） */
  maxHeight?: string
  className?: string
}

/** 通用列表表格：TanStack Table v8 + shadcn Table + 内置分页/骨架/空态/多选 */
export function DataTable<TData>({
  columns,
  data,
  loading,
  total,
  page,
  pageSize = 20,
  onPageChange,
  onPageSizeChange: _onPageSizeChange,
  rowKey,
  onRowClick,
  enableRowSelection,
  onRowSelectionChange,
  toolbar,
  bulkActions,
  empty,
  size = 'md',
  zebra = true,
  stickyHeader = true,
  maxHeight,
  className,
}: DataTableProps<TData>) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const finalColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!enableRowSelection) return columns
    return [
      {
        id: '__select__',
        size: 36,
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="全选当前页"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            onClick={(e) => e.stopPropagation()}
            aria-label="选择行"
          />
        ),
        enableSorting: false,
      },
      ...columns,
    ]
  }, [columns, enableRowSelection])

  const table = useReactTable({
    data,
    columns: finalColumns,
    state: { rowSelection },
    enableRowSelection: !!enableRowSelection,
    onRowSelectionChange: (updater) => {
      setRowSelection((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        return next
      })
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId: rowKey
      ? (original, index) => String(rowKey(original, index))
      : undefined,
  })

  // 选中行回调
  React.useEffect(() => {
    if (!onRowSelectionChange) return
    const selected = table.getSelectedRowModel().rows.map((r: Row<TData>) => r.original)
    onRowSelectionChange(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection])

  const showEmpty = !loading && data.length === 0
  const pageCount = total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : 1
  const currentPage = page ?? 1
  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original)

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {toolbar}
      {enableRowSelection && bulkActions && selectedRows.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="text-foreground">
            已选 <span className="font-semibold text-primary">{selectedRows.length}</span> 项
          </span>
          <div className="flex items-center gap-2">{bulkActions(selectedRows)}</div>
        </div>
      )}

      <div
        className={cn(
          'rounded-xl border border-border bg-card shadow-xs',
          maxHeight && 'overflow-auto',
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <Table>
          <TableHeader
            className={cn(
              'bg-muted/40',
              stickyHeader && 'sticky top-0 z-10 backdrop-blur-sm',
            )}
          >
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="border-border">
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    style={h.column.columnDef.size ? { width: h.column.columnDef.size } : undefined}
                    className={cn(
                      'text-xs font-medium uppercase tracking-wider text-muted-foreground/80',
                      size === 'sm' ? 'h-9 px-3' : 'h-10 px-3',
                    )}
                  >
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {finalColumns.map((_col, j) => (
                    <TableCell key={`sk-${i}-${j}`} className={size === 'sm' ? 'h-9' : 'h-11'}>
                      <Skeleton className="h-4 w-3/4" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!loading &&
              table.getRowModel().rows.map((row, idx) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(
                    'border-border transition-colors',
                    zebra && idx % 2 === 1 && 'bg-muted/20',
                    onRowClick && 'cursor-pointer hover:bg-primary/[0.04]',
                    row.getIsSelected() && 'bg-primary/[0.06]',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        size === 'sm' ? 'h-9 px-3 py-1.5 text-xs' : 'h-11 px-3 py-2 text-sm',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {showEmpty && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={finalColumns.length} className="h-64 p-0">
                  {empty ?? (
                    <EmptyState
                      icon={Inbox}
                      title="暂无数据"
                      description="试试调整筛选条件或新建一条数据"
                    />
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      {total !== undefined && total > 0 && onPageChange && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            共 <span className="font-semibold text-foreground">{total}</span> 条 · 第{' '}
            {currentPage} / {pageCount} 页
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            >
              <ChevronLeft className="size-3.5" strokeWidth={2.25} />
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={currentPage >= pageCount}
              onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
            >
              下一页
              <ChevronRight className="size-3.5" strokeWidth={2.25} />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
