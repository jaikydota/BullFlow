import { useMemo, useState } from 'react'
import {
  BookOpen, Check, Copy, Crown, Flame, Heart, Image, Mail, Megaphone, Music,
  PenLine, Play, Search, Share2, ShoppingBag, Sparkles, Star, Video, Wand2, X,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PlatformBadge } from '@/components/tlf/PlatformBadge'
import { getPlatformName } from '@/utils/tlfPlatforms'
import type { SkillItem } from '@/api/skills'
import { cn } from '@/lib/utils'

// 仅收录 skill 实际用到的图标，避免整包引入 lucide
const SKILL_ICONS: Record<string, typeof Crown> = {
  Sparkles, Wand2, PenLine, Megaphone, Search, Flame, Heart, Video, Play,
  ShoppingBag, BookOpen, Music, Copy, Mail, Image, Share2,
}

function SkillIcon({ name, className }: { name?: string | null; className?: string }) {
  if (name && /^[A-Z]/.test(name) && SKILL_ICONS[name]) {
    const Cmp = SKILL_ICONS[name]
    return <Cmp className={className} aria-hidden />
  }
  if (name && !/^[A-Z]/.test(name)) return <span className="text-lg leading-none">{name}</span>
  return <Crown className={className} aria-hidden />
}

// 分类 → 中文名 + 图标盒渐变色（增加文艺色彩层次）
const CATEGORY: Record<string, { label: string; box: string }> = {
  humanize: { label: '去 AI 味', box: 'from-violet-500/20 to-fuchsia-500/15 text-violet-600 dark:text-violet-300' },
  platform: { label: '平台风格', box: 'from-rose-500/20 to-orange-500/15 text-rose-600 dark:text-rose-300' },
  format: { label: '格式结构', box: 'from-sky-500/20 to-cyan-500/15 text-sky-600 dark:text-sky-300' },
}
const catBox = (c?: string | null) => CATEGORY[c ?? '']?.box ?? 'from-primary/20 to-primary/10 text-primary'

export type SkillPickerDialogProps = {
  open: boolean
  onClose: () => void
  skills: SkillItem[]
  value: string | null | undefined
  onSelect: (id: string | null) => void
  loading?: boolean
}

/** 「创作大师」选择弹窗：搜索 + 分类筛选 + 卡片网格，文艺精致风格。 */
export function SkillPickerDialog({ open, onClose, skills, value, onSelect, loading }: SkillPickerDialogProps) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>('all')

  // 当前可选分类（按数据里实际出现的）
  const cats = useMemo(() => {
    const set = new Set(skills.map((s) => s.category).filter(Boolean) as string[])
    return ['all', ...['humanize', 'platform', 'format'].filter((c) => set.has(c))]
  }, [skills])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return skills.filter((s) => {
      if (cat !== 'all' && s.category !== cat) return false
      if (!kw) return true
      const hay = [
        s.name, s.description ?? '', s.category ?? '',
        ...s.platforms, ...s.platforms.map(getPlatformName),
      ].join(' ').toLowerCase()
      return hay.includes(kw)
    })
  }, [skills, q, cat])

  const pick = (id: string | null) => { onSelect(id); onClose() }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[min(90dvh,820px)] w-[min(100vw-1.5rem,72rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        {/* 文艺渐变头部 */}
        <div className="relative shrink-0 overflow-hidden border-b border-border bg-gradient-to-br from-primary/12 via-card to-card px-6 pb-5 pt-6">
          <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-1/3 size-32 rounded-full bg-fuchsia-400/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-fuchsia-500/15 text-primary shadow-soft">
                <Crown className="size-5" aria-hidden />
              </span>
              <div>
                <DialogTitle className="text-[19px] font-semibold tracking-tight text-foreground">选择创作大师</DialogTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">为这次创作挑一位风格大师 · 共 {skills.length} 位</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-app hover:bg-muted hover:text-foreground"
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 搜索 + 分类筛选 */}
          <div className="relative mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索大师 / 平台 / 风格…"
                className="h-9 rounded-xl border-border/70 bg-card/80 pl-9 backdrop-blur"
              />
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5">
              {cats.map((c) => {
                const active = cat === c
                const label = c === 'all' ? '全部' : CATEGORY[c]?.label ?? c
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCat(c)}
                    className={cn(
                      'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-app',
                      active
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 卡片网格 */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#FCFBFE] px-5 py-4 dark:bg-background">
          {/* 不使用 */}
          <button
            type="button"
            onClick={() => pick(null)}
            className={cn(
              'mb-3 flex w-full cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-app',
              !value ? 'border-primary/40 bg-primary/[0.06] text-primary' : 'border-dashed border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground',
            )}
          >
            <span className="flex-1 text-left font-medium">不使用创作大师</span>
            {!value && <Check className="size-4" aria-hidden />}
          </button>

          {loading && skills.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">加载中…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">没有匹配的创作大师</div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((s) => {
                const active = s.id === value
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pick(s.id)}
                    title={s.description ?? undefined}
                    className={cn(
                      'group relative flex cursor-pointer flex-col gap-2 rounded-2xl border p-3.5 text-left transition-app',
                      active
                        ? 'border-primary/45 bg-primary/[0.05] shadow-soft ring-1 ring-primary/15'
                        : s.recommended
                          ? 'border-amber-400/50 bg-amber-50/40 hover:-translate-y-0.5 hover:border-amber-400/70 hover:shadow-card dark:bg-amber-500/[0.06]'
                          : 'border-border bg-card hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card',
                    )}
                  >
                    {s.recommended && (
                      <span className="pointer-events-none absolute right-2.5 top-2.5 inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-soft">
                        <Star className="size-2.5 fill-current" aria-hidden />
                        推荐
                      </span>
                    )}
                    <div className="flex items-start gap-3">
                      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br', catBox(s.category))}>
                        <SkillIcon name={s.icon} className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 pr-12">
                          <span className="truncate text-sm font-semibold text-foreground">{s.name}</span>
                          {active && <Check className="size-3.5 shrink-0 text-primary" aria-hidden />}
                        </div>
                        {s.category && CATEGORY[s.category] && (
                          <span className="text-[11px] text-muted-foreground">{CATEGORY[s.category].label}</span>
                        )}
                      </div>
                    </div>
                    {s.description && (
                      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{s.description}</p>
                    )}
                    {s.platforms.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {s.platforms.slice(0, 4).map((p) => (
                          <PlatformBadge key={p} code={p} size="sm" className="px-1.5 py-0 text-[10px]" />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
