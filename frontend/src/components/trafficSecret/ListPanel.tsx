import { useMemo, useState } from 'react'
import { ChevronRight, Flame, Search, Star, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/utils/helpers'
import type { TrafficSecretItem } from '@/api/trafficSecret'
import { PRICE_LABEL_KEYS, type TrafficSecretTab } from './types'

type Props = {
  items: TrafficSecretItem[]
  loading: boolean
  onSelect: (id: string) => void
  onClose: () => void
}

const TABS: { key: TrafficSecretTab; labelKey: string; fallback: string }[] = [
  { key: 'all', labelKey: 'trafficSecret.tabAll', fallback: '全部' },
  { key: 'company', labelKey: 'trafficSecret.tabCompany', fallback: '自研' },
  { key: 'partner', labelKey: 'trafficSecret.tabPartner', fallback: '合作' },
  { key: 'hot', labelKey: 'trafficSecret.tabHot', fallback: '热门' },
]

export function ListPanel({ items, loading, onSelect, onClose }: Props) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TrafficSecretTab>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return items.filter((item) => {
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        (item.description ?? '').toLowerCase().includes(q) ||
        (item.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      const matchesTab =
        activeTab === 'all' ||
        (activeTab === 'company' && item.source === 'company') ||
        (activeTab === 'partner' && item.source === 'partner') ||
        (activeTab === 'hot' && (item.rating ?? 0) >= 4.7)
      return matchesSearch && matchesTab
    })
  }, [items, activeTab, searchQuery])

  return (
    <div className="flex h-full w-full flex-col bg-card">
      {/* Header */}
      <div className="relative shrink-0 border-b border-border bg-card px-5 pb-4 pt-5">
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/[0.07] to-transparent pointer-events-none" />
        <div className="relative mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-pink-500 text-white shadow-soft">
              <Flame className="h-[18px] w-[18px]" strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold leading-tight text-foreground">
                {t('trafficSecret.title', '流量密码')}
              </div>
              <div className="mt-1 truncate text-[12px] leading-snug text-muted-foreground">
                {t('trafficSecret.subtitle', '发现更多适合你的产品与工具')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 transition hover:bg-muted hover:text-foreground cursor-pointer"
            aria-label={t('common.close', '关闭')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('trafficSecret.search', '搜索…')}
            className={cn(
              'h-10 w-full rounded-lg border border-input bg-muted/40 pl-9 pr-3 text-[13px] text-foreground outline-none transition',
              'placeholder:text-muted-foreground/80',
              'focus:border-ring focus:bg-card focus:ring-2 focus:ring-ring/30',
            )}
          />
        </div>

        <div className="mt-3 inline-flex w-full items-center gap-1 rounded-lg bg-muted/60 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium transition cursor-pointer',
                activeTab === tab.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(tab.labelKey, tab.fallback)}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-3">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-xs text-muted-foreground">
              {t('common.loading', '加载中…')}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-xs text-muted-foreground">
              <Flame className="h-6 w-6 opacity-40" />
              <span>{t('trafficSecret.empty', '暂无内容')}</span>
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  'group relative flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition cursor-pointer',
                  'hover:border-primary/40 hover:bg-muted/40 hover:shadow-soft',
                )}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md text-[22px]">
                  {item.iconUrl ? (
                    <img
                      src={item.iconUrl}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{item.icon || '🎯'}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold leading-tight text-foreground group-hover:text-primary">
                        {item.title}
                      </div>
                      {item.description && (
                        <div className="mt-1 line-clamp-1 text-[12px] leading-snug text-muted-foreground">
                          {item.description}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {item.category && (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {item.category}
                      </span>
                    )}
                    {item.priceStatus && PRICE_LABEL_KEYS[item.priceStatus] && (
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                        {t(PRICE_LABEL_KEYS[item.priceStatus], item.priceStatus)}
                      </span>
                    )}
                    {item.rating != null && (
                      <span className="ml-auto inline-flex items-center gap-0.5 text-[12px] font-medium text-amber-500">
                        <Star className="h-3 w-3 fill-amber-500" />
                        {item.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border bg-card/60 px-4 py-2 text-[11px] text-muted-foreground/80">
        {t('common.total', '共')} {filtered.length}
      </div>
    </div>
  )
}
