import { useState, useCallback } from 'react'

export function usePagination(defaultPageSize = 20) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [total, setTotal] = useState(0)

  const onChange = useCallback((newPage: number, newPageSize?: number) => {
    setPage(newPage)
    if (newPageSize) setPageSize(newPageSize)
  }, [])

  const reset = useCallback(() => {
    setPage(1)
    setTotal(0)
  }, [])

  return {
    page,
    pageSize,
    total,
    setTotal,
    onChange,
    reset,
    pages: Math.ceil(total / pageSize) || 1,
  }
}
