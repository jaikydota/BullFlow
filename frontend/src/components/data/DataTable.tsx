import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { EmptyState } from '@/components/common/EmptyState'
import { Pagination } from '@/components/common/Pagination'
import { Skeleton, Spinner } from '@/components/common/Spinner'
import { cn } from '@/utils/helpers'

export type DataTablePagination = {
  page: number
  pageSize: number
  total: number
  onChange: (page: number, pageSize?: number) => void
}

export type DataTableProps<T> = {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  loading?: boolean
  pagination?: DataTablePagination
  toolbar?: ReactNode
  onRowClick?: (row: T) => void
  emptyText?: string
}

const SKELETON_ROWS = 8

export function DataTable<T>({
  columns, data, loading = false, pagination, toolbar, onRowClick, emptyText = '暂无数据',
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const columnCount = columns.length

  const table = useReactTable({
    data, columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const skeletonCount = useMemo(() => pagination ? Math.min(pagination.pageSize, SKELETON_ROWS) : SKELETON_ROWS, [pagination])
  const showEmpty = !loading && data.length === 0
  const pages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 0

  return (
    <div className="flex w-full flex-col gap-4">
      {(toolbar != null || loading) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
          {loading && <Spinner size="sm" />}
        </div>
      )}

      <div className="card-base overflow-hidden">
        {showEmpty ? (
          <div className="p-8">
            <EmptyState title={emptyText} />
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-border/60 bg-muted/30">
                    {headerGroup.headers.map((header) => {
                      const canSort = header.column.getCanSort()
                      const sorted = header.column.getIsSorted()
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          className={cn(
                            'px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground',
                            canSort && 'cursor-pointer select-none transition-colors hover:text-foreground',
                          )}
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                            {canSort && (
                              <span className="text-muted-foreground/60" aria-hidden>
                                {sorted === 'asc' ? <ArrowUp className="size-3" /> : sorted === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-60" />}
                              </span>
                            )}
                          </span>
                        </th>
                      )
                    })}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-border/60">
                {loading
                  ? Array.from({ length: skeletonCount }).map((_, rowIdx) => (
                    <tr key={`sk-${rowIdx}`}>
                      {Array.from({ length: columnCount }).map((__, colIdx) => (
                        <td key={colIdx} className="px-4 py-3.5">
                          <Skeleton className="h-4 w-full max-w-[12rem]" />
                        </td>
                      ))}
                    </tr>
                  ))
                  : table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        'transition-colors',
                        onRowClick && 'cursor-pointer hover:bg-muted/40',
                      )}
                      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3 text-sm text-foreground">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagination && !showEmpty && pages > 1 && (
        <Pagination
          page={pagination.page}
          pages={pages}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onChange={(p) => pagination.onChange(p)}
        />
      )}
    </div>
  )
}
