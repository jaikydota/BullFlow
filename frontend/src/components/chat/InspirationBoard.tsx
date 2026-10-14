import { useMemo, useState } from 'react'
import { SectionCard } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  channels,
  growthStrategies,
  hotContents,
  industries,
  industryInsights,
  inspirationIcons,
  type ChannelId,
  type IndustryId,
} from '@/pages/chat/inspirations'

export type InspirationBoardProps = {
  /** 一键生成：点击灵感项时回调 prompt，由父组件填入 ChatComposer 并发送/滚动 */
  onApply: (prompt: string) => void
  className?: string
}

export function InspirationBoard({ onApply, className }: InspirationBoardProps) {
  const [industry, setIndustry] = useState<IndustryId>('all')
  const [channel, setChannel] = useState<ChannelId>('all')

  const filteredHot = useMemo(
    () =>
      hotContents.filter((h) => {
        if (industry !== 'all' && h.industry !== industry) return false
        if (channel !== 'all' && h.channel !== channel) return false
        return true
      }),
    [industry, channel],
  )

  const filteredGrowth = useMemo(
    () =>
      growthStrategies.filter((g) => industry === 'all' || g.industry === 'all' || g.industry === industry),
    [industry],
  )

  const filteredIndustry = useMemo(
    () => industryInsights.filter((i) => industry === 'all' || i.id === industry),
    [industry],
  )

  return (
    <div className={cn('space-y-4', className)}>
      {/* 过滤器 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">行业</span>
        <div className="flex flex-wrap gap-1.5">
          {industries.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => setIndustry(it.id)}
              className={cn(
                'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                industry === it.id
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-primary',
              )}
            >
              {it.label}
            </button>
          ))}
        </div>
        <span className="ml-3 text-xs font-semibold text-muted-foreground">渠道</span>
        <div className="flex flex-wrap gap-1.5">
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChannel(c.id)}
              className={cn(
                'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                channel === c.id
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-primary',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* 三栏 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 热门内容 */}
        <SectionCard
          variant="default"
          icon={inspirationIcons.hot}
          iconAccent="rose"
          title="热门内容"
          description="本周高互动内容形式与拆解模板"
          bodyClassName="p-4 space-y-2.5"
        >
          {filteredHot.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">该条件下暂无热门内容</p>
          ) : (
            filteredHot.map((h) => (
              <div
                key={h.id}
                className="group rounded-xl border border-border/70 bg-card/60 p-3 transition-colors hover:border-primary/30 hover:bg-primary/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-1 text-sm font-medium text-foreground">{h.title}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Badge variant="outline" className="border-border bg-muted/40 text-[10px]">
                        {h.category}
                      </Badge>
                      <span>曝光 {h.exposure}</span>
                      <span>·</span>
                      <span>互动 {h.engagement}</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs"
                    onClick={() => onApply(h.prompt)}
                  >
                    生成
                  </Button>
                </div>
              </div>
            ))
          )}
        </SectionCard>

        {/* 增长打法 */}
        <SectionCard
          variant="default"
          icon={inspirationIcons.growth}
          iconAccent="primary"
          title="增长打法"
          description="经过验证的爆款公式与卖点策略"
          bodyClassName="p-4 space-y-2.5"
        >
          {filteredGrowth.map((g, idx) => {
            const Icon = g.icon
            return (
              <div
                key={g.id}
                className="group flex items-start gap-3 rounded-xl border border-border/70 bg-card/60 p-3 transition-colors hover:border-primary/30 hover:bg-primary/5"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Icon className="size-3.5 text-primary" strokeWidth={2.25} aria-hidden />
                    <span className="text-sm font-medium text-foreground">{g.title}</span>
                    <Badge variant="outline" className="border-border bg-muted/40 text-[10px]">
                      {g.category}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{g.desc}</p>
                  <div className="mt-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-emerald-600 dark:text-emerald-400">{g.effect}</span>
                    <button
                      type="button"
                      className="cursor-pointer text-primary hover:underline"
                      onClick={() => onApply(g.prompt)}
                    >
                      应用 →
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </SectionCard>

        {/* 行业灵感 */}
        <SectionCard
          variant="default"
          icon={inspirationIcons.industry}
          iconAccent="info"
          title="行业灵感"
          description="基于行业的内容包推荐"
          bodyClassName="p-4 space-y-2.5"
        >
          {filteredIndustry.map((i) => (
            <div
              key={i.id}
              className="group rounded-xl border border-border/70 bg-card/60 p-3 transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{i.emoji}</span>
                <span className="text-sm font-medium text-foreground">{i.name}</span>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li>推荐形式：{i.recommendType}</li>
                <li>推荐渠道：{i.recommendChannel}</li>
                <li>推荐技能：{i.recommendSkill}</li>
              </ul>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2.5 w-full text-xs"
                onClick={() => onApply(i.prompt)}
              >
                生成 7 天内容包
              </Button>
            </div>
          ))}
        </SectionCard>
      </div>
    </div>
  )
}
