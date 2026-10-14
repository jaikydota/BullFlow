/**
 * 分发配置展示组件（搭配 useDistributionConfig）。拆成三块以适配
 * 「分步向导」(PublishPage) 与「单页」(ScheduleEditorPage) 两种布局：
 * - <PlatformPicker>      平台多选网格 + 聚合规范预览
 * - <DistributionSettings> 内容分类 + 批量设置（可见性/原创/AI；定时仅 publish）
 * - <AccountPicker>       每平台目标账号多选
 */
import { useState } from 'react'
import { CircleCheck, Globe, HelpCircle, Layers, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SectionCard } from '@/components/shared/SectionCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { DateTimePicker } from '@/components/common/DateTimePicker'
import { PlatformLogo } from '@/components/tlf/PlatformLogo'
import { RegionTabs, matchRegion, type RegionValue } from '@/components/tlf/RegionTabs'
import { cn } from '@/lib/utils'
import { getPlatformName, isOverseaPlatform } from '@/utils/tlfPlatforms'
import {
  platformSupports,
  categoryRequirement,
  batchOriginalSupported,
  batchAISupported,
  kindLabel,
  BATCH_SETTING_HINTS,
} from '@/utils/tlfPlatformConstraints'
import type { DistributionConfig } from '@/components/tlf/useDistributionConfig'

/* ─────────── 平台多选 + 规范预览 ─────────── */
export function PlatformPicker({ dc, showSpecPreview = true }: { dc: DistributionConfig; showSpecPreview?: boolean }) {
  const {
    platformCodes, compatiblePlatforms, allowedKinds, inferredKind, isMultiPlatform,
    singleKind, dominantKind, constraint, titleRange, descRange, imagesRange,
    togglePlatform, selectAllPlatforms, clearAllPlatforms, boundPlatformCodes,
  } = dc
  const [region, setRegion] = useState<RegionValue>('all')
  const shownPlatforms = compatiblePlatforms.filter((p) => matchRegion(region, p.code))
  return (
    <>
      <SectionCard
        title={`目标平台（已选 ${platformCodes.length} / ${compatiblePlatforms.length}）`}
        description="点击卡片切换选中；支持多选，一份内容可一次发布到多个平台"
        actions={
          compatiblePlatforms.length > 0 ? (
            <div className="flex items-center gap-3 text-xs">
              <button type="button" onClick={selectAllPlatforms} className="cursor-pointer text-primary hover:underline">
                全选
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                onClick={clearAllPlatforms}
                disabled={platformCodes.length === 0}
                className="cursor-pointer text-muted-foreground hover:underline disabled:opacity-40"
              >
                清空
              </button>
            </div>
          ) : null
        }
      >
        {compatiblePlatforms.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="没有支持此内容类型的平台"
            description={`「${kindLabel(inferredKind)}」目前没有可用的平台`}
          />
        ) : (
          <>
          <RegionTabs value={region} onChange={setRegion} size="sm" className="mb-3" />
          {shownPlatforms.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">该区域暂无支持此内容类型的平台</p>
          ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shownPlatforms.map((p) => {
              const selected = platformCodes.includes(p.code)
              const supportKinds = allowedKinds.filter((k) => platformSupports(p.code, k))
              return (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => togglePlatform(p.code)}
                  className={cn(
                    'group relative cursor-pointer rounded-xl border bg-card p-4 text-left card-hover',
                    selected ? 'border-primary ring-2 ring-primary/30' : 'border-border',
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <PlatformLogo code={p.code} size={20} />
                      <span className="truncate text-sm font-semibold">{p.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {boundPlatformCodes.has(p.code) && (
                        <span
                          className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
                          title="该平台已绑定可用账号"
                        >
                          <CircleCheck className="size-3" /> 已绑定
                        </span>
                      )}
                      {isOverseaPlatform(p.code) && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                          <Globe className="size-3" /> 全球
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {supportKinds.map((k) => (
                      <span
                        key={k}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px]',
                          k === inferredKind ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {kindLabel(k)}
                      </span>
                    ))}
                  </div>
                  {selected && <span className="absolute right-3 top-3 size-2 rounded-full bg-primary" />}
                </button>
              )
            })}
          </div>
          )}
          </>
        )}
      </SectionCard>

      {platformCodes.some(isOverseaPlatform) && (
        <div className="flex items-start gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-xs text-sky-700 dark:text-sky-300">
          <Globe className="mt-0.5 size-4 shrink-0" />
          <span>
            海外平台内容由云端代发，<strong>发布无需本地 VPN</strong>（仅首次授权账号时需要能访问该平台）。
          </span>
        </div>
      )}

      {showSpecPreview && platformCodes.length > 0 && constraint && (
        <SectionCard
          title={isMultiPlatform ? '聚合规范（多平台取最严格）' : '规范预览'}
          description={
            isMultiPlatform
              ? '标题 / 正文 / 媒体的上限按所有选中平台中最严格的那个取值，提交时自动适配'
              : `仅展示「${kindLabel(singleKind ?? inferredKind)}」相关字段约束`
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {titleRange && (
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <p className="text-muted-foreground">标题</p>
                <p className="mt-0.5 font-medium tabular-nums">
                  {titleRange.min ? `${titleRange.min} - ` : '≤ '}
                  {titleRange.max} 字
                </p>
              </div>
            )}
            {descRange && (
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <p className="text-muted-foreground">
                  正文{descRange.required && <span className="ml-1 text-rose-500">*</span>}
                </p>
                <p className="mt-0.5 font-medium tabular-nums">
                  {descRange.max !== undefined
                    ? `${descRange.min ? `${descRange.min} - ` : '≤ '}${descRange.max} 字`
                    : '不限字数'}
                </p>
              </div>
            )}
            {imagesRange && (
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <p className="text-muted-foreground">
                  {dominantKind === 'dynamic' ? '图片' : '封面'}
                  {imagesRange.required && <span className="ml-1 text-rose-500">*</span>}
                </p>
                <p className="mt-0.5 font-medium tabular-nums">
                  {imagesRange.max === 0
                    ? '不支持'
                    : imagesRange.min && imagesRange.min === imagesRange.max
                      ? `${imagesRange.min} 张`
                      : `${imagesRange.min || 0}${imagesRange.max ? ` - ${imagesRange.max}` : '+'} 张`}
                </p>
              </div>
            )}
          </div>
          {imagesRange?.note && <p className="mt-2 text-xs text-muted-foreground">{imagesRange.note}</p>}
        </SectionCard>
      )}
    </>
  )
}

/* ─────────── 内容分类 + 批量设置 ─────────── */
export function DistributionSettings({
  dc,
  prePubError,
}: {
  dc: DistributionConfig
  /** 定时发布的校验错误信息（仅 publish 模式） */
  prePubError?: string
}) {
  const {
    mode, isMultiPlatform, platformCodes, kindByPlatform,
    categoryPlatforms, categoryOptsByPlatform, categoryLoadingByPlatform, categoryLoadErrorByPlatform, categorySelByPlatform,
    accountsByPlatform, accountsLoadingByPlatform, setCategory,
    scheduleEnabled, setScheduleEnabled, scheduleLocal, setScheduleLocal, scheduleBounds, prePubSpec,
    originalChecked, setOriginalChecked, aiChecked, setAiChecked, isPublic, setIsPublic,
    redditSubreddit, setRedditSubreddit,
  } = dc
  // 海外平台（Composio）按平台默认发布，可见性/原创/AI/分类/定时这些灵径专属设置都不适用
  const allOversea = platformCodes.length > 0 && platformCodes.every(isOverseaPlatform)
  const selectCls =
    'h-9 min-w-[10rem] cursor-pointer rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <>
      {categoryPlatforms.length > 0 && (
        <SectionCard title="内容分类" description="部分平台发布需选择分类；标「必填」的平台未选无法提交">
          <div className="space-y-3">
            {categoryPlatforms.map((code) => {
              const kind = kindByPlatform[code]!
              const req = categoryRequirement(code, kind)
              const opts = categoryOptsByPlatform[code] ?? []
              const loading = categoryLoadingByPlatform[code]
              const loadErr = categoryLoadErrorByPlatform[code]
              const sel = categorySelByPlatform[code] ?? { l1: null, l2: null }
              const pool = accountsByPlatform[code] ?? []
              const accountsLoading = accountsLoadingByPlatform[code]
              const l2opts = sel.l1?.child ?? []
              return (
                <div key={code} className="rounded-lg border bg-card p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <PlatformLogo code={code} size={18} />
                    <span className="text-sm font-medium">{getPlatformName(code)}</span>
                    {req === 'required' ? (
                      !sel.l1 && <span className="text-xs text-rose-600">分类必填，请选择</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">分类可选</span>
                    )}
                  </div>
                  {pool.length === 0 ? (
                    accountsLoading ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" /> 账号加载中…
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        该平台暂无账号，请先到「账号管理」授权后再来选分类
                      </p>
                    )
                  ) : loading ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> 分类加载中…
                    </p>
                  ) : opts.length === 0 ? (
                    loadErr ? (
                      // 拉取失败：必填平台红字 + 引导重新授权（多为账号登录态过期）；可选平台淡色提示可不选
                      req === 'required' ? (
                        <p className="text-xs text-rose-600">
                          分类加载失败：{loadErr}。该平台分类必填，请到「账号管理」重新授权该账号后重试。
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">分类加载失败（{loadErr}），可不选分类直接发布</p>
                      )
                    ) : (
                      <p className="text-xs text-muted-foreground">该平台暂无可选分类{req === 'optional' ? '，可不选直接发布' : ''}</p>
                    )
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <select
                        className={selectCls}
                        value={sel.l1?.yixiaoerId ?? ''}
                        onChange={(e) => {
                          const node = opts.find((o) => o.yixiaoerId === e.target.value) ?? null
                          setCategory(code, node, null)
                        }}
                      >
                        <option value="">选择一级分类</option>
                        {opts.map((o) => (
                          <option key={o.yixiaoerId} value={o.yixiaoerId}>{o.yixiaoerName}</option>
                        ))}
                      </select>
                      {l2opts.length > 0 && (
                        <select
                          className={selectCls}
                          value={sel.l2?.yixiaoerId ?? ''}
                          onChange={(e) => {
                            const node = l2opts.find((o) => o.yixiaoerId === e.target.value) ?? null
                            setCategory(code, sel.l1, node)
                          }}
                        >
                          <option value="">选择二级分类</option>
                          {l2opts.map((o) => (
                            <option key={o.yixiaoerId} value={o.yixiaoerId}>{o.yixiaoerName}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      {platformCodes.includes('Reddit') && (
        <SectionCard title="Reddit 版块" description="Reddit 发帖必须指定目标版块（subreddit），所有选中的 Reddit 账号都发到这个版块">
          <input
            value={redditSubreddit}
            onChange={(e) => setRedditSubreddit(e.target.value)}
            placeholder="例如：test（不含 r/ 前缀）"
            className="h-9 w-full max-w-sm rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {!redditSubreddit.trim() && (
            <p className="mt-1.5 text-xs text-rose-600">请填写 Reddit 版块名，否则该平台无法发布</p>
          )}
        </SectionCard>
      )}

      <SectionCard
        title="批量设置"
        description={
          allOversea
            ? '海外平台按平台默认规则发布'
            : isMultiPlatform ? '勾选项对所有选中平台生效，不支持的平台后端自动忽略' : '勾选项对该平台生效'
        }
      >
        {allOversea ? (
          <div className="rounded-lg bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
            海外平台（X / LinkedIn / Facebook / Reddit / Instagram / YouTube）按平台默认发布，无需可见性 / 原创 / AI 声明 / 定时等设置。
          </div>
        ) : (
        <div className="space-y-5">
          {/* 定时发布（仅内容发布场景；自动生成规则由 cron 决定时间，不展示） */}
          {mode === 'publish' && (
            <div className="rounded-lg border bg-card p-3.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox checked={scheduleEnabled} onCheckedChange={(v) => setScheduleEnabled(v === true)} />
                定时发布
              </label>
              {scheduleEnabled && (
                <div className="mt-3 space-y-1.5">
                  <DateTimePicker
                    value={scheduleLocal}
                    min={scheduleBounds?.min}
                    max={scheduleBounds?.max}
                    onChange={setScheduleLocal}
                    placeholder="选择发布时间"
                  />
                  {prePubSpec && (
                    <p className="text-[11px] text-muted-foreground">
                      可设置范围：{prePubSpec.minHours} 小时后 ～ {prePubSpec.maxDays} 天内
                    </p>
                  )}
                  {prePubError && <p className="text-xs text-rose-600">{prePubError}</p>}
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                <span className="text-foreground/70">不支持：</span>
                {BATCH_SETTING_HINTS.schedule.unsupported}
              </p>
              <p className="text-[11px] text-muted-foreground">{BATCH_SETTING_HINTS.schedule.footnote}</p>
            </div>
          )}

          {/* 原创声明 / AI 生成内容 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-card p-3.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox checked={originalChecked} onCheckedChange={(v) => setOriginalChecked(v === true)} />
                开启原创声明
              </label>
              <p className="mt-2 flex items-start gap-1 text-[11px] text-muted-foreground">
                <span><span className="text-foreground/70">支持：</span>{BATCH_SETTING_HINTS.original.supported}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="查看支持原创声明的全部平台"
                      className="mt-px inline-flex shrink-0 cursor-help text-muted-foreground/60 transition-colors hover:text-primary"
                    >
                      <HelpCircle className="size-3.5" strokeWidth={2.1} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="end" className="max-w-[300px] leading-relaxed">
                    <p className="mb-1 font-medium">支持「原创声明」的平台</p>
                    <p className="text-background/80">{BATCH_SETTING_HINTS.original.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              </p>
              {isMultiPlatform && originalChecked && (
                <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                  将对其中 {platformCodes.filter((c) => batchOriginalSupported(c, kindByPlatform[c]!)).length} 个支持的平台生效
                </p>
              )}
            </div>

            <div className="rounded-lg border bg-card p-3.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox checked={aiChecked} onCheckedChange={(v) => setAiChecked(v === true)} />
                包含 AI 生成内容
              </label>
              <p className="mt-2 flex items-start gap-1 text-[11px] text-muted-foreground">
                <span><span className="text-foreground/70">支持：</span>{BATCH_SETTING_HINTS.ai.supported}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="查看支持 AI 生成声明的全部平台"
                      className="mt-px inline-flex shrink-0 cursor-help text-muted-foreground/60 transition-colors hover:text-primary"
                    >
                      <HelpCircle className="size-3.5" strokeWidth={2.1} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="end" className="max-w-[300px] leading-relaxed">
                    <p className="mb-1 font-medium">支持「AI 生成声明」的平台</p>
                    <p className="text-background/80">{BATCH_SETTING_HINTS.ai.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              </p>
              {isMultiPlatform && aiChecked && (
                <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                  将对其中 {platformCodes.filter((c) => batchAISupported(c, kindByPlatform[c]!)).length} 个支持的平台生效
                </p>
              )}
            </div>
          </div>

          {/* 谁可以看 */}
          <div className="rounded-lg border bg-card p-3.5">
            <Label className="text-sm font-medium">谁可以看</Label>
            <div className="mt-2 flex items-center gap-5">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" checked={isPublic} onChange={() => setIsPublic(true)} className="size-4 cursor-pointer accent-primary" />
                公开
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" checked={!isPublic} onChange={() => setIsPublic(false)} className="size-4 cursor-pointer accent-primary" />
                私密 / 草稿
              </label>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              <span className="text-foreground/70">不支持：</span>
              {BATCH_SETTING_HINTS.private.unsupported}
            </p>
          </div>
        </div>
        )}
      </SectionCard>
    </>
  )
}

/* ─────────── 每平台目标账号 ─────────── */
export function AccountPicker({ dc }: { dc: DistributionConfig }) {
  const {
    platformCodes, accountsByPlatform, accountsLoadingByPlatform, selectedAccountIdsByPlatform,
    kindByPlatform, totalSelectedAccounts, toggleAccount, toggleAllAccountsFor,
  } = dc
  return (
    <SectionCard
      title="目标账号"
      description={
        platformCodes.length === 0
          ? '请先选择平台'
          : `已选 ${totalSelectedAccounts} 个账号，覆盖 ${platformCodes.length} 个平台`
      }
    >
      {platformCodes.length === 0 ? (
        <div className="rounded-md bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
          请先选择目标平台
        </div>
      ) : (
        <div className="space-y-3">
          {platformCodes.map((code) => {
            const list = accountsByPlatform[code] ?? []
            const loading = accountsLoadingByPlatform[code]
            const selectedIds = selectedAccountIdsByPlatform[code] ?? new Set<string>()
            const allSelected = list.length > 0 && selectedIds.size === list.length
            const kind = kindByPlatform[code]
            return (
              <div key={code} className="rounded-lg border bg-card">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <PlatformLogo code={code} size={18} />
                    <span className="truncate text-sm font-medium">{getPlatformName(code)}</span>
                    {kind && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {kindLabel(kind)}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground tabular-nums">{selectedIds.size}/{list.length}</span>
                    {list.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleAllAccountsFor(code)}
                        className="cursor-pointer text-primary hover:underline"
                      >
                        {allSelected ? '取消全选' : '全选'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="px-3 py-2">
                  {loading ? (
                    <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                      <Loader2 className="mr-2 size-3.5 animate-spin" /> 加载中…
                    </div>
                  ) : list.length === 0 ? (
                    <div className="py-3 text-center text-xs text-muted-foreground">
                      没有可用账号 ·{' '}
                      <a href="/tlf/accounts" className="text-primary hover:underline">去授权</a>
                    </div>
                  ) : (
                    <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                      {list.map((a) => (
                        <label
                          key={a.id}
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 transition',
                            selectedIds.has(a.id) ? 'border-primary/40 bg-primary/[0.06]' : 'border-border bg-card hover:bg-accent',
                          )}
                        >
                          <Checkbox checked={selectedIds.has(a.id)} onCheckedChange={() => toggleAccount(code, a.id)} />
                          <Avatar className="size-6">
                            {a.platform_avatar && <AvatarImage src={a.platform_avatar} alt={a.platform_user_name ?? ''} />}
                            <AvatarFallback>{(a.platform_user_name ?? a.platform_user_id).slice(0, 1)}</AvatarFallback>
                          </Avatar>
                          <span className="flex-1 truncate text-xs">{a.platform_user_name ?? a.platform_user_id}</span>
                          {a.status !== 'active' && <Badge variant="destructive">{a.status}</Badge>}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}