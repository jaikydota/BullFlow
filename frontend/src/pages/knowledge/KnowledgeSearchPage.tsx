import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpen, Loader2, Search, ShieldAlert } from 'lucide-react'
import { ApiError } from '@/types/api'
import { Button } from '@/components/common/Button'
import { toast } from '@/components/common/Toast'
import SearchResult from '@/components/knowledge/SearchResult'
import { PageContainer, PageHeader } from '@/components/shared'
import { useAuth } from '@/hooks/useAuth'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import { cn } from '@/utils/helpers'

type SearchMode = 'hybrid' | 'vector' | 'text'

const MODES: { id: SearchMode; label: string }[] = [
  { id: 'hybrid', label: '混合检索' },
  { id: 'vector', label: '向量检索' },
  { id: 'text', label: '全文检索' },
]

export default function KnowledgeSearchPage() {
  const { t } = useTranslation()
  const { isSuperAdmin } = useAuth()
  const search = useKnowledgeStore((s) => s.search)
  const searchText = useKnowledgeStore((s) => s.searchText)
  const searchVector = useKnowledgeStore((s) => s.searchVector)
  const clearResults = useKnowledgeStore((s) => s.clearResults)
  const searchResults = useKnowledgeStore((s) => s.searchResults)
  const searchLoading = useKnowledgeStore((s) => s.searchLoading)
  const total = useKnowledgeStore((s) => s.total)

  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('hybrid')
  // tracks whether the user has ever pressed Search in the current session
  const [hasSearched, setHasSearched] = useState(false)

  const runSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) {
      clearResults()
      return
    }
    setHasSearched(true)
    const top_k = 20
    try {
      if (mode === 'hybrid') {
        await search(q, { top_k, use_reranker: true })
      } else if (mode === 'vector') {
        await searchVector(q, { top_k })
      } else {
        await searchText(q, { top_k })
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('common.failed')
      toast.error(msg)
    }
  }, [clearResults, mode, search, searchText, searchVector, query, t])

  // Reset hasSearched when query is cleared
  useEffect(() => {
    if (!query.trim()) {
      setHasSearched(false)
      clearResults()
    }
  }, [query, clearResults])

  const hasTextResults = searchResults.length > 0

  // 非超管直接跳到 dashboard（侧栏菜单已隐藏，这里兜底防直接访问 URL）
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />

  return (
    <PageContainer>
      <PageHeader
        title={t('menu.search', '精准检索')}
        description={t(
          'knowledge.searchSubtitle',
          'Search across documents and images with multiple retrieval modes.',
        )}
        icon={Search}
        iconAccent="info"
        breadcrumbs={[{ label: '资产管理' }, { label: '知识检索' }, { label: t('menu.search', '精准检索') }]}
      />

      {/* 仅超管可见提示 banner */}
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        <ShieldAlert className="size-4 shrink-0" strokeWidth={2.2} />
        <span>
          <span className="font-semibold">仅超级管理员可见</span>
          ：此页用于内部检索能力测试（混合检索 / 向量检索 / 全文检索），普通用户请使用「知识查找」。
        </span>
      </div>

      {/* 搜索框 —— 与「知识查找」同款 */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch()
            }}
            placeholder={t('knowledge.queryPlaceholder', '输入关键词或语义描述，按 Enter 检索…')}
            className="w-full rounded-xl border border-border bg-muted/40 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-app focus:border-primary/50 focus:bg-muted focus:outline-none"
          />
        </div>
        <Button
          onClick={() => void runSearch()}
          disabled={searchLoading || !query.trim()}
          className="shrink-0"
        >
          {searchLoading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          <span>{searchLoading ? t('knowledge.searching', '搜索中…') : t('common.search', '搜索')}</span>
        </Button>
      </div>

      {/* 模式切换 —— 下划线 tab 风格，与「知识查找」结果切换同款 */}
      <div className="mt-5 flex items-center gap-1 border-b border-border pb-3">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-app focus-visible:outline-none',
              mode === m.id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 结果区 */}
      <div className="mt-4 space-y-4">
        {/* 未搜索状态 */}
        {!hasSearched && !searchLoading && (
          <div className="flex flex-1 items-center justify-center py-20">
            <div className="text-center">
              <BookOpen className="mx-auto mb-4 size-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">输入关键词开始检索</p>
              <p className="mt-1 text-xs text-muted-foreground/70">支持混合 / 向量 / 全文三种检索模式</p>
            </div>
          </div>
        )}

        {/* 搜索中 */}
        {searchLoading && (
          <div className="flex flex-1 items-center justify-center py-20">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="text-sm">{t('knowledge.searching', '正在检索知识库…')}</span>
            </div>
          </div>
        )}

        {/* 结果列表 */}
        {!searchLoading && hasTextResults && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('knowledge.resultsCount', '{{count}} 条结果', { count: total })}
            </p>
            <ul className="flex flex-col gap-3">
              {searchResults.map((r) => (
                <li key={r.chunk_id}>
                  <SearchResult result={r} highlightQuery={query} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 无结果 */}
        {!searchLoading && hasSearched && !hasTextResults && (
          <div className="py-16 text-center text-muted-foreground">
            <Search className="mx-auto mb-3 size-10 opacity-20" />
            <p className="text-sm">未找到与「{query}」相关的内容</p>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
