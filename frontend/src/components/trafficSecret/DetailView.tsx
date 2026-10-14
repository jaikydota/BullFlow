import { ArrowLeft, ArrowUpRight, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import MarkDown2 from '@/components/markdown2'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTheme } from '@/components/theme/ThemeProvider'
import { cn } from '@/utils/helpers'
import type { TrafficSecretItem } from '@/api/trafficSecret'
import { PRICE_LABEL_KEYS } from './types'

type Props = {
  item: TrafficSecretItem
  onBack: () => void
}

export function DetailView({ item, onBack }: Props) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()

  const handleOpen = () => {
    if (!item.url) return
    window.open(item.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex h-full w-full flex-col bg-card">
      {/* Sticky header — 高度对齐 ListPanel header */}
      <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/85 px-4 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/80 transition hover:bg-muted hover:text-foreground cursor-pointer"
          aria-label={t('trafficSecret.back', '返回')}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <span>{t('trafficSecret.title', '流量密码')}</span>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-semibold text-foreground">
            {t('trafficSecret.detail', '产品详情')}
          </span>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-5">
          {/* 产品大卡 */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/[0.05] via-card to-pink-500/[0.05] p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md text-[32px]">
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
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[17px] font-semibold leading-tight text-foreground">
                    {item.title}
                  </h3>
                  {item.source && (
                    <span className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {item.source === 'company' ? '自研' : '合作'}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {item.rating != null && (
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                      <Star className="h-3 w-3 fill-current" />
                      {item.rating.toFixed(1)}
                    </span>
                  )}
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
                </div>
              </div>
            </div>
          </div>

          {/* 标签 */}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Markdown 详情 */}
          <div
            className={cn(
              'rounded-2xl border border-border bg-card p-5 text-[14px] leading-relaxed text-foreground',
              'shadow-xs',
            )}
          >
            {item.contentMarkdown ? (
              <MarkDown2 content={item.contentMarkdown} theme={resolvedTheme} />
            ) : (
              <div className="px-1 py-6 text-center text-xs text-muted-foreground">
                {t('trafficSecret.empty', '暂无内容')}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* 底部 CTA */}
      <div className="shrink-0 border-t border-border bg-card/95 p-4 backdrop-blur">
        <button
          type="button"
          onClick={handleOpen}
          className={cn(
            'flex h-11 w-full items-center justify-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold text-white shadow-soft transition cursor-pointer',
            'bg-gradient-to-r from-primary to-pink-500 hover:shadow-pop hover:brightness-105 active:brightness-95',
          )}
        >
          {t('trafficSecret.useNow', '立即使用')}
          <ArrowUpRight className="h-4 w-4" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  )
}
