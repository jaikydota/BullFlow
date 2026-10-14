import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { documentsApi } from '@/api/documents'
import type { DocumentChunk } from '@/types/document'
import { Badge } from '@/components/common/Badge'
import { Button } from '@/components/common/Button'
import { Pagination } from '@/components/common/Pagination'
import { SearchInput } from '@/components/common/SearchInput'
import { Spinner } from '@/components/common/Spinner'
import { EmptyState } from '@/components/common/EmptyState'
import { cn } from '@/utils/helpers'

const PREVIEW_LEN = 200
const PAGE_SIZE = 20

export type ChunkViewerProps = {
  documentId: string
  className?: string
}

export function ChunkViewer({ documentId, className }: ChunkViewerProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [chunks, setChunks] = useState<DocumentChunk[]>([])
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const acc: DocumentChunk[] = []
      const maxPages = 200
      for (let p = 1; p <= maxPages; p++) {
        const data = await documentsApi.chunks(documentId, { page: p, page_size: 200 })
        acc.push(...data.items)
        if (acc.length >= data.total || data.items.length === 0) break
      }
      setChunks(acc)
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return chunks
    return chunks.filter((c) => c.content.toLowerCase().includes(q))
  }, [chunks, filter])

  useEffect(() => {
    setPage(1)
  }, [filter, documentId])

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1)
  const safePage = Math.min(page, totalPages)
  const slice = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, safePage])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (loading) {
    return (
      <div className={cn('flex min-h-[200px] items-center justify-center rounded-xl glass-card', className)}>
        <Spinner className="text-blue-600" />
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold text-text-primary">
          {t('documents.chunks', 'Chunks')} ({chunks.length})
        </h3>
        <div className="relative max-w-md flex-1">
          <SearchInput
            value={filter}
            onChange={setFilter}
            placeholder={t('documents.searchChunks', 'Search in chunks…')}
            className="w-full"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t('documents.noChunks', 'No chunks match your search.')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {slice.map((chunk) => {
            const isOpen = expanded[chunk.id]
            const long = chunk.content.length > PREVIEW_LEN
            const shown =
              isOpen || !long ? chunk.content : `${chunk.content.slice(0, PREVIEW_LEN)}…`
            return (
              <li
                key={chunk.id}
                className="rounded-xl glass-card p-4 transition-app hover:ring-1 hover:ring-neon-cyan/20"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    #{chunk.chunk_index}
                  </span>
                  {chunk.token_count != null ? (
                    <Badge variant="default" size="sm">
                      {chunk.token_count} tokens
                    </Badge>
                  ) : null}
                  {long ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => toggleExpand(chunk.id)}>
                      {isOpen ? t('common.collapse', 'Collapse') : t('common.expand', 'Expand')}
                    </Button>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{shown}</p>
              </li>
            )
          })}
        </ul>
      )}

      {total > PAGE_SIZE ? (
        <Pagination
          page={safePage}
          pageSize={PAGE_SIZE}
          total={total}
          onChange={(p) => {
            setPage(p)
          }}
        />
      ) : null}
    </div>
  )
}
