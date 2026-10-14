import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, FileSearch } from 'lucide-react'
import type { SearchResult as SearchResultType } from '@/types/knowledge'
import { documentsApi } from '@/api/documents'
import { Badge } from '@/components/common/Badge'
import { DocumentPreview } from '@/components/common/DocumentPreview'
import { cn } from '@/utils/helpers'

export type SearchResultProps = {
  result: SearchResultType
  highlightQuery?: string
}

/**
 * Render an HTML string from ES highlight (contains <em> tags) as React nodes,
 * falling back to client-side regex highlight when no server highlight is available.
 */
function renderHighlight(
  text: string,
  esFragments: string[] | undefined,
  fallbackQuery: string | undefined,
): ReactNode {
  if (esFragments && esFragments.length > 0) {
    const joined = esFragments.join(' … ')
    return (
      <span
        dangerouslySetInnerHTML={{ __html: joined }}
        className="es-highlight"
      />
    )
  }
  return clientHighlight(text, fallbackQuery)
}

function clientHighlight(text: string, query: string | undefined): ReactNode {
  const q = query?.trim()
  if (!q) return text
  const parts = q.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return text
  const pattern = new RegExp(
    `(${parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi',
  )
  const nodes: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(pattern)) {
    const idx = m.index ?? 0
    if (idx > last) nodes.push(text.slice(last, idx))
    nodes.push(
      <mark key={key++} className="rounded bg-neon-amber/20 px-0.5 text-neon-amber">
        {m[0]}
      </mark>,
    )
    last = idx + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length ? nodes : text
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    vector: 'Vector',
    fulltext: 'Full-text',
    hybrid: 'Hybrid',
    reranker: 'Reranker',
  }
  return map[source] ?? source
}

function normalizeScore(score: number): number {
  if (score <= 1 && score >= 0) return Math.round(score * 1000) / 10
  if (score <= 100 && score >= 0) return Math.round(score * 10) / 10
  return Math.round(score * 100) / 100
}

export default function SearchResult({ result, highlightQuery }: SearchResultProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const displayScore = useMemo(() => normalizeScore(result.score), [result.score])

  const openPreview = useCallback(async () => {
    if (previewLoading) return
    setPreviewLoading(true)
    try {
      const { url } = await documentsApi.download(result.document_id)
      setPreviewUrl(url)
    } catch {
      // fallback: try direct path from metadata
      const path = result.metadata?.file_path
      if (typeof path === 'string') setPreviewUrl(path)
    } finally {
      setPreviewLoading(false)
    }
  }, [previewLoading, result.document_id, result.metadata])
  const barPct = useMemo(() => {
    const s = result.score
    if (s <= 1 && s >= 0) return s * 100
    if (s <= 100 && s >= 0) return s
    return Math.min(100, Math.log10(1 + s) * 20)
  }, [result.score])

  const titleDisplay = useMemo(() => {
    if (result.highlight_title && result.highlight_title.length > 0) {
      return (
        <span
          dangerouslySetInnerHTML={{ __html: result.highlight_title[0] }}
          className="es-highlight"
        />
      )
    }
    return result.document_title || t('knowledge.untitledDoc', 'Untitled document')
  }, [result.highlight_title, result.document_title, t])

  return (
    <article
      className={cn(
        'glass-card rounded-xl border border-white/[0.06] p-4 transition-app',
        'hover:border-neon-cyan/20',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Badge variant="info" size="sm" className="max-w-full truncate font-medium">
            {titleDisplay}
          </Badge>
          <Badge variant="default" size="sm">
            {sourceLabel(result.source)}
          </Badge>
          <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs font-semibold text-text-secondary ring-1 ring-white/[0.08]">
            {displayScore}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void openPreview()}
            disabled={previewLoading}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-neon-cyan/80 hover:bg-neon-cyan/[0.08] hover:text-neon-cyan disabled:opacity-50 transition-app"
            title="预览源文档"
          >
            <FileSearch className={cn('size-4', previewLoading && 'animate-pulse')} />
            {previewLoading ? '加载中' : '查看源文档'}
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-neon-cyan hover:bg-neon-cyan/[0.08]"
          >
            {open ? (
              <>
                {t('common.collapse', 'Collapse')} <ChevronUp className="size-4" />
              </>
            ) : (
              <>
                {t('common.expand', 'Expand')} <ChevronDown className="size-4" />
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-neon-green transition-all"
          style={{ width: `${Math.min(100, Math.max(4, barPct))}%` }}
        />
      </div>

      <div
        className={cn(
          'mt-3 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary',
          !open && 'line-clamp-4',
        )}
      >
        {renderHighlight(result.content, result.highlight_content, highlightQuery)}
      </div>

      {previewUrl && (
        <DocumentPreview
          url={previewUrl}
          fileName={result.file_name || result.document_title}
          fileType={result.file_type || undefined}
          title={result.document_title}
          onClose={() => setPreviewUrl(null)}
        />
      )}
    </article>
  )
}
