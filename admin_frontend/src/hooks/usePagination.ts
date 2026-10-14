import { useCallback, useMemo, useState } from 'react'

export type PaginationState = {
  page: number
  pageSize: number
  total: number
  pageCount: number
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  setTotal: (total: number) => void
  reset: () => void
}

/** 受控分页 hook：调用方触发 setPage / setPageSize 后自行拉新数据 */
export function usePagination(initial: { page?: number; pageSize?: number } = {}): PaginationState {
  const initPage = initial.page ?? 1
  const initSize = initial.pageSize ?? 20
  const [page, setPage] = useState(initPage)
  const [pageSize, setPageSize] = useState(initSize)
  const [total, setTotal] = useState(0)

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize],
  )

  const reset = useCallback(() => {
    setPage(initPage)
    setPageSize(initSize)
    setTotal(0)
  }, [initPage, initSize])

  return { page, pageSize, total, pageCount, setPage, setPageSize, setTotal, reset }
}
