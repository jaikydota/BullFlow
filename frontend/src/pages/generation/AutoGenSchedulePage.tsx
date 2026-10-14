import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarClock,
  CheckCircle,
  Clapperboard,
  FileText,
  ImageIcon,
  Loader2,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react'
import { getPlatformName } from '@/utils/tlfPlatforms'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/common/Badge'
import { Button } from '@/components/common/Button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { toast } from '@/components/common/Toast'
import { PageHeader } from '@/components/shared'
import { scheduleApi } from '@/api/generationSchedule'
import type { GenerationSchedule, ScheduleContentType } from '@/types/generationSchedule'
import { formatDate } from '@/utils/format'
import { cn } from '@/utils/helpers'

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<ScheduleContentType, React.ReactNode> = {
  article: <FileText className="size-4" />,
  image:   <ImageIcon className="size-4" />,
  video:   <Clapperboard className="size-4" />,
}

const TYPE_LABEL: Record<ScheduleContentType, string> = {
  article: '文章',
  image:   '图片',
  video:   '视频',
}

const TYPE_COLOR = {
  article: {
    text:     'text-blue-600 dark:text-blue-400',
    border:   'border-blue-500/40',
    bg:       'bg-blue-500/10',
    gradient: 'from-blue-500/25 to-cyan-500/25',
    ring:     'ring-blue-500/30',
  },
  image: {
    text:     'text-emerald-600 dark:text-emerald-400',
    border:   'border-emerald-500/40',
    bg:       'bg-emerald-500/10',
    gradient: 'from-emerald-500/20 to-teal-500/20',
    ring:     'ring-emerald-500/30',
  },
  video: {
    text:     'text-rose-600 dark:text-rose-400',
    border:   'border-rose-500/40',
    bg:       'bg-rose-500/10',
    gradient: 'from-rose-500/20 to-amber-500/20',
    ring:     'ring-rose-500/30',
  },
}

const DOW_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function formatFreq(schedule: GenerationSchedule): string {
  const time = `${String(schedule.cron_hour).padStart(2, '0')}:${String(schedule.cron_minute).padStart(2, '0')}`
  if (!schedule.cron_days_of_week) return `每天 ${time}`
  const days = schedule.cron_days_of_week.split(',').map(d => DOW_NAMES[Number(d)]).join('、')
  return `每周${days} ${time}`
}

// ── Schedule Card ─────────────────────────────────────────────────────────────

function ScheduleCard({
  schedule,
  onEdit,
  onDelete,
  onToggle,
  onRunNow,
}: {
  schedule: GenerationSchedule
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  onRunNow: () => void
}) {
  const color = TYPE_COLOR[schedule.type as ScheduleContentType]

  return (
    // 外层 motion.div 负责进入/退出 transform；内层 div 负责 hover transform。
    // 不能合并到一层——framer-motion 动画结束后会在元素上留 inline transform: translate(0,0)，
    // 会覆盖 card-hover 的 :hover transform: translateY(-3px)。
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      <div
        className={cn(
          'flex h-full flex-col bg-card rounded-2xl border border-border p-5 card-hover',
          !schedule.is_active && 'opacity-60',
        )}
      >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Type icon */}
          <div className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br border',
            `bg-gradient-to-br ${color.gradient}`, color.border,
          )}>
            <span className={color.text}>{TYPE_ICON[schedule.type as ScheduleContentType]}</span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border',
                color.bg, color.text, color.border,
              )}>
                {TYPE_ICON[schedule.type as ScheduleContentType]}
                {TYPE_LABEL[schedule.type as ScheduleContentType]}
              </span>
              {!schedule.is_active && (
                <Badge color="muted">已暂停</Badge>
              )}
            </div>
            <h3 className="truncate text-sm font-semibold text-foreground">{schedule.name}</h3>
          </div>
        </div>

        {/* Active toggle —— 统一用主色 primary（开）/ muted（关），不跟随类型色，开关状态对比清晰 */}
        <button
          type="button"
          onClick={onToggle}
          title={schedule.is_active ? '点击暂停' : '点击启用'}
          className={cn(
            'relative cursor-pointer flex h-6 w-11 shrink-0 items-center rounded-full border transition-all duration-300',
            schedule.is_active
              ? 'border-primary bg-primary'
              : 'border-border bg-muted',
          )}
        >
          <motion.span
            layout
            animate={{ x: schedule.is_active ? 20 : 2 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="absolute size-4 rounded-full bg-white shadow-md"
          />
        </button>
      </div>

      {/* Stats */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 truncate">
          <CalendarClock className="size-3 shrink-0 opacity-60" />
          <span className="truncate">{formatFreq(schedule)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Play className="size-3 shrink-0 opacity-60" />
          <span>已执行 {schedule.run_count} 次</span>
        </div>
        {schedule.next_run_at && schedule.is_active && (
          <div className="col-span-2 flex items-center gap-1.5">
            <CalendarClock className="size-3 shrink-0 opacity-60" />
            <span>下次：{formatDate(schedule.next_run_at)}</span>
          </div>
        )}
        {schedule.last_run_at && (
          <div className="col-span-2 flex items-center gap-1.5">
            {schedule.last_status === 'failed'
              ? <XCircle className="size-3 shrink-0 text-rose-500" />
              : schedule.last_status === 'running'
                ? <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
                : <CheckCircle className="size-3 shrink-0 opacity-60" />}
            <span className="truncate">
              上次：{formatDate(schedule.last_run_at)}
              {schedule.last_status === 'failed' && (
                <span className="text-rose-500"> · 失败</span>
              )}
              {schedule.last_status === 'running' && (
                <span className="text-primary"> · 执行中</span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* 自动分发徽章（仅当启用时）；多平台显示平台数，单平台显示平台名 */}
      {schedule.auto_distribute_enabled && (schedule.distribute_config?.platforms?.length || schedule.distribute_platform_code) && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          <Send className="size-3" strokeWidth={2.2} />
          {(() => {
            const platforms = schedule.distribute_config?.platforms
            if (platforms && platforms.length > 1) return `自动分发 · ${platforms.length} 个平台`
            const code = platforms?.[0] ?? schedule.distribute_platform_code
            const accounts = code
              ? (schedule.distribute_config?.accounts?.[code]?.length ?? schedule.distribute_account_ids?.length ?? 0)
              : 0
            return `自动分发 · ${code ? getPlatformName(code) : ''} · ${accounts} 账号`
          })()}
        </div>
      )}

      {/* Prompt preview —— flex-1 撑开剩余空间，让 Actions 顶到底部，所有卡片等高 */}
      <p className="mt-2 flex-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
        {(schedule.gen_config?.prompt as string | undefined) ?? ''}
      </p>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-3">
        <button
          type="button"
          onClick={onRunNow}
          title="立即执行一次"
          className={cn(
            'cursor-pointer flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all',
            'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground/80',
          )}
        >
          <Play className="size-3" /> 立即执行
        </button>
        <button
          type="button"
          onClick={onEdit}
          className={cn(
            'cursor-pointer flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all',
            'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground/80',
          )}
        >
          <Pencil className="size-3" /> 编辑
        </button>
        <button
          type="button"
          onClick={onDelete}
          className={cn(
            'cursor-pointer ml-auto flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all',
            'border-rose-500/30 text-rose-500/60 hover:border-rose-500/50 hover:text-rose-500',
          )}
        >
          <Trash2 className="size-3" /> 删除
        </button>
      </div>
      </div>
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AutoGenSchedulePage() {
  const navigate = useNavigate()
  const [schedules, setSchedules] = useState<GenerationSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<GenerationSchedule | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadSchedules = useCallback(async () => {
    setLoading(true)
    try {
      const data = await scheduleApi.list({ page_size: 100 })
      setSchedules(data.items)
    } catch {
      toast.error('加载调度规则失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSchedules() }, [loadSchedules])

  const openCreate = () => navigate('/generation/auto-schedule/new')
  const openEdit = (s: GenerationSchedule) => navigate(`/generation/auto-schedule/edit/${s.id}`)

  const handleToggle = async (s: GenerationSchedule) => {
    try {
      const updated = await scheduleApi.toggle(s.id)
      setSchedules(prev => prev.map(x => x.id === s.id ? updated : x))
      toast.success(updated.is_active ? '已启用' : '已暂停')
    } catch {
      toast.error('操作失败')
    }
  }

  const handleRunNow = async (s: GenerationSchedule) => {
    try {
      await scheduleApi.runNow(s.id)
      toast.success('已触发，内容稍后写入内容库')
      // 后台异步执行：稍后多次刷新，反映「执行中 / 已执行次数 +1 / 完成或失败」
      ;[1500, 5000, 12000].forEach((ms) => setTimeout(() => { void loadSchedules() }, ms))
    } catch {
      toast.error('触发失败')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await scheduleApi.delete(deleteTarget.id)
      setSchedules(prev => prev.filter(s => s.id !== deleteTarget.id))
      toast.success('已删除')
    } catch {
      toast.error('删除失败')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="w-full space-y-6 pb-12 md:pb-16">
      <PageHeader
        title="自动任务"
        description="设置调度规则，365 天自动生成内容到内容库"
        icon={CalendarClock}
        iconAccent="primary"
        breadcrumbs={[{ label: '创作分发' }, { label: '内容创作' }, { label: '自动任务' }]}
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus className="size-4" />
            新建规则
          </Button>
        }
      />

      {/* Content */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card rounded-2xl border border-border h-56 animate-pulse" />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl border border-border py-20 text-center"
        >
          <CalendarClock className="mx-auto mb-4 size-12 text-blue-600 dark:text-blue-400/40" />
          <p className="text-base font-medium text-foreground/80">还没有自动生成规则</p>
          <p className="mt-1 text-sm text-muted-foreground">创建规则后，系统将在指定时间自动为你生成内容</p>
          <Button type="button" className="mt-6" onClick={openCreate}>
            <Plus className="size-4" />
            创建第一条规则
          </Button>
        </motion.div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {schedules.map(s => (
              <ScheduleCard
                key={s.id}
                schedule={s}
                onEdit={() => openEdit(s)}
                onDelete={() => setDeleteTarget(s)}
                onToggle={() => handleToggle(s)}
                onRunNow={() => handleRunNow(s)}
              />
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="确认删除"
        message={`删除规则「${deleteTarget?.name}」后，该规则将停止自动生成，已生成的内容不受影响。`}
        confirmText="确认删除"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
