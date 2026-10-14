/**
 * 自动生成规则「新建 / 编辑」独立页面。
 * - 生成设置区：名称 / 类型 / 执行频率 + 复用三个生成页的 <GenerationConfigPanel>（与文章/图文/视频生成完全一致）
 * - 自动分发区：开关 + 复用 <PlatformPicker>/<DistributionSettings>/<AccountPicker>（mode='rule'），
 *   与「国内发布 → 配置发布」同一套分发配置；内容由生成后填充，标签由生成内容元数据带入。
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CalendarClock, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { toast } from '@/components/common/Toast'
import { cn } from '@/lib/utils'
import { scheduleApi } from '@/api/generationSchedule'
import { ApiError } from '@/types/api'
import { inferPublishKind, type PublishKind } from '@/utils/tlfPlatformConstraints'
import { useDistributionConfig } from '@/components/tlf/useDistributionConfig'
import { PlatformPicker, DistributionSettings, AccountPicker } from '@/components/tlf/DistributionConfig'
import { GenerationConfigPanel } from '@/components/generation/GenerationConfigPanel'
import {
  defaultGenConfig,
  serializeGenConfig,
  hydrateGenConfig,
  type GenerationConfig,
} from '@/components/generation/genConfig'
import type { ScheduleContentType, ScheduleRequest } from '@/types/generationSchedule'

const CONTENT_TYPES: { value: ScheduleContentType; label: string }[] = [
  { value: 'article', label: '文章' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
]
const DOW = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function buildCronDow(days: number[]): string | null {
  if (days.length === 0 || days.length === 7) return null
  return [...days].sort((a, b) => a - b).join(',')
}
function parseCronDow(raw: string | null): number[] {
  if (!raw) return []
  return raw.split(',').map(Number).filter((n) => !Number.isNaN(n))
}

const chip = (active: boolean) =>
  cn(
    'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition',
    active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-foreground/30',
  )

export function ScheduleEditorPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

  // 生成设置
  const [name, setName] = useState('')
  const [type, setType] = useState<ScheduleContentType>('article')
  const [hour, setHour] = useState(9)
  const [minute, setMinute] = useState(0)
  const [days, setDays] = useState<number[]>([])
  const [genConfig, setGenConfig] = useState<GenerationConfig>(() => defaultGenConfig('article'))

  // 自动分发
  const [autoDistribute, setAutoDistribute] = useState(false)
  const pubKind: PublishKind = inferPublishKind(type)
  const dc = useDistributionConfig({ allowedKinds: [pubKind], inferredKind: pubKind, mode: 'rule' })

  const hydratedRef = useRef(false)

  // 编辑：加载规则并回灌
  useEffect(() => {
    if (!id) return
    let cancelled = false
    void (async () => {
      try {
        const s = await scheduleApi.get(id)
        if (cancelled) return
        setName(s.name)
        setType(s.type)
        setHour(s.cron_hour)
        setMinute(s.cron_minute)
        setDays(parseCronDow(s.cron_days_of_week))
        setGenConfig(hydrateGenConfig(s.type, s.gen_config))
        setAutoDistribute(s.auto_distribute_enabled ?? false)
        // 回灌分发配置（优先 distribute_config，回退旧单平台字段）
        const cfg = s.distribute_config
        if (cfg?.platforms?.length) {
          dc.hydrate({
            platforms: cfg.platforms,
            accounts: cfg.accounts,
            isPublic: cfg.ui?.isPublic,
            original: cfg.ui?.original,
            ai: cfg.ui?.ai,
            category: cfg.ui?.category as never,
            redditSubreddit: (cfg.extras?.Reddit as { extra?: { subreddit?: string } } | undefined)?.extra?.subreddit,
          })
        } else if (s.distribute_platform_code && s.distribute_account_ids?.length) {
          dc.hydrate({
            platforms: [s.distribute_platform_code],
            accounts: { [s.distribute_platform_code]: s.distribute_account_ids },
          })
        }
        hydratedRef.current = true
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : '规则加载失败')
        navigate('/generation/auto-schedule')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))

  // 用户切换内容类型：重置生成配置为该类型默认，并清空已选分发平台（kind 变了）
  const changeType = (tp: ScheduleContentType) => {
    setType(tp)
    setGenConfig(defaultGenConfig(tp))
    dc.setPlatformCodes([])
  }

  const handleSave = async () => {
    if (!name.trim()) return toast.error('请填写规则名称')
    if (!genConfig.prompt.trim()) return toast.error('请填写提示词')
    if (autoDistribute) {
      if (dc.platformCodes.length === 0) return toast.error('开启自动分发时请至少选择一个平台')
      if (!dc.allPlatformsHaveAccount) return toast.error('每个分发平台至少选择一个账号')
      if (dc.categoryError) return toast.error(dc.categoryError)
    }
    setSaving(true)
    try {
      const gen_config = await serializeGenConfig(type, genConfig)
      const req: ScheduleRequest = {
        name: name.trim(),
        type,
        cron_hour: hour,
        cron_minute: minute,
        cron_days_of_week: buildCronDow(days),
        timezone: 'Asia/Shanghai',
        gen_config,
        auto_distribute_enabled: autoDistribute,
        distribute_config: autoDistribute ? dc.serialize() : null,
      }
      if (isEdit) await scheduleApi.update(id!, req)
      else await scheduleApi.create(req)
      toast.success(isEdit ? '规则已更新' : '规则已创建')
      navigate('/generation/auto-schedule')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-32 text-muted-foreground">
          <Loader2 className="mr-2 size-6 animate-spin" /> 加载规则…
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        icon={CalendarClock}
        title={isEdit ? '编辑自动生成规则' : '新建自动生成规则'}
        description="定时自动生成内容，并可按「配置发布」同款规则自动分发到多平台多账号"
        actions={
          <Button variant="outline" onClick={() => navigate('/generation/auto-schedule')} className="cursor-pointer">
            返回列表
          </Button>
        }
      />

      <div className="space-y-5">
        {/* 生成设置 */}
        <SectionCard title="生成设置" description="定时触发时按以下配置自动生成一条内容（与文章/图文/视频生成页一致）">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rule-name">规则名称</Label>
              <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="如：每日小红书种草文" />
            </div>

            <div className="space-y-1.5">
              <Label>内容类型</Label>
              <div className="flex gap-2">
                {CONTENT_TYPES.map((ct) => (
                  <button key={ct.value} type="button" onClick={() => changeType(ct.value)}
                    className={cn(
                      'flex-1 cursor-pointer rounded-xl border py-2 text-sm font-medium transition',
                      type === ct.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-foreground/30',
                    )}>
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>执行频率</Label>
              <div className="flex flex-wrap gap-1.5">
                {DOW.map((label, idx) => (
                  <button key={idx} type="button" onClick={() => toggleDay(idx)} className={chip(days.includes(idx))}>{label}</button>
                ))}
                <button type="button" onClick={() => setDays([])} className={chip(days.length === 0)}>每天</button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="shrink-0 text-xs text-muted-foreground">执行时间</span>
                <select value={hour} onChange={(e) => setHour(Number(e.target.value))}
                  className="h-9 w-20 cursor-pointer rounded-md border border-input bg-background px-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}</option>)}
                </select>
                <span className="font-bold text-muted-foreground">:</span>
                <input type="number" min={0} max={59} value={minute}
                  onChange={(e) => { const v = Math.max(0, Math.min(59, Number(e.target.value.slice(-2)))); setMinute(Number.isNaN(v) ? 0 : v) }}
                  className="h-9 w-20 rounded-md border border-input bg-background px-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              </div>
            </div>

            {/* 生成配置面板（与三个生成页同源） */}
            <GenerationConfigPanel contentType={type} value={genConfig} onChange={setGenConfig} disabled={saving} />
          </div>
        </SectionCard>

        {/* 自动分发 */}
        <SectionCard
          title={<span className="flex items-center gap-2"><Send className="size-4" /> 自动分发</span>}
          description="生成完成后自动按所选平台规范分发到指定账号（标题/正文/媒体由生成内容填充，标签由内容自动带入）"
          actions={
            <button
              type="button"
              onClick={() => setAutoDistribute((v) => !v)}
              aria-label="切换自动分发"
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
                autoDistribute ? 'bg-primary' : 'bg-muted-foreground/30',
              )}
            >
              <span className={cn('inline-block size-4 transform rounded-full bg-white shadow transition-transform', autoDistribute ? 'translate-x-[18px]' : 'translate-x-0.5')} />
            </button>
          }
        >
          {autoDistribute ? (
            <div className="space-y-5">
              <PlatformPicker dc={dc} showSpecPreview={false} />
              <DistributionSettings dc={dc} />
              <AccountPicker dc={dc} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">开启后可配置多平台、多账号、可见性、原创/AI 声明与内容分类，与「内容发布」配置发布一致。</p>
          )}
        </SectionCard>

        <div className="flex justify-end gap-2 pb-2">
          <Button variant="outline" onClick={() => navigate('/generation/auto-schedule')} className="cursor-pointer">取消</Button>
          <Button onClick={() => void handleSave()} disabled={saving} className="cursor-pointer">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? '保存修改' : '创建规则'}
          </Button>
        </div>
      </div>
    </PageContainer>
  )
}

export default ScheduleEditorPage
