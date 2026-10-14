import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react'

import { Badge } from '@/components/common/Badge'
import { Button } from '@/components/common/Button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { StatCard } from '@/components/data/StatCard'
import { toast } from '@/components/common/Toast'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { PlatformBadge } from '@/components/tlf/PlatformBadge'
import { tlfApi } from '@/api/tlf'
import { getPublishFailureHint } from '@/utils/tlfPlatformUrls'
import type { TlfTask, TlfTaskStatus } from '@/types/tlf'
import { ApiError } from '@/types/api'
import { formatDate } from '@/utils/format'
import { cn } from '@/lib/utils'

const POLL_INTERVAL = 10_000

const STATUS_META: Record<
  TlfTaskStatus,
  { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info'; icon: typeof Clock }
> = {
  pending: { label: '排队中', variant: 'default', icon: Clock },
  publishing: { label: '发布中', variant: 'warning', icon: Loader2 },
  success: { label: '全部成功', variant: 'success', icon: CheckCircle2 },
  partial: { label: '部分成功', variant: 'warning', icon: AlertCircle },
  failed: { label: '失败', variant: 'danger', icon: XCircle },
  cancelled: { label: '已取消', variant: 'default', icon: XCircle },
}

/** 解析任务中「失败的本地账号 ID」：用于重试时只重发失败账号，不碰已成功的。 */
function failedLocalAccountIds(task: TlfTask): string[] {
  const snap = task.account_snapshot ?? []
  const tlfToLocal = new Map(snap.filter((s) => s.tlfAccountId).map((s) => [s.tlfAccountId as string, s.id]))
  const failed = (task.result_summary ?? []).filter((r) => r.status === 'failed')
  if (failed.length > 0) {
    const ids = new Set<string>()
    for (const r of failed) {
      const localId = r.accountId || (r.tlfAccountId ? tlfToLocal.get(r.tlfAccountId) : undefined)
      if (localId) ids.add(localId)
    }
    if (ids.size > 0) return [...ids]
  }
  // 整单失败（网关未受理、无逐账号结果）→ 全部目标账号
  if (task.status === 'failed') return task.target_account_ids ?? []
  return []
}

function StatusBadge({ status }: { status: TlfTaskStatus }) {
  const meta = STATUS_META[status] ?? { label: status, variant: 'default' as const, icon: Clock }
  const Icon = meta.icon
  return (
    <Badge variant={meta.variant} size="sm">
      <Icon className={status === 'publishing' ? 'mr-1 size-3 animate-spin' : 'mr-1 size-3'} />
      {meta.label}
    </Badge>
  )
}

export default function TlfTaskMonitorPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const highlightId = params.get('highlight')

  const [tasks, setTasks] = useState<TlfTask[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchTasks = useCallback(async () => {
    try {
      const data = await tlfApi.listTasks({ page: 1, page_size: 50 })
      setTasks(data.items)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '加载任务失败')
    }
  }, [])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLoading(true)
    void fetchTasks().finally(() => setLoading(false))
    pollRef.current = setInterval(() => {
      // 仅当有 pending / publishing 任务时才主动轮询，节省请求
      setTasks((prev) => {
        if (prev.some((t) => t.status === 'pending' || t.status === 'publishing')) {
          void fetchTasks()
        }
        return prev
      })
    }, POLL_INTERVAL)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchTasks])
  /* eslint-enable react-hooks/set-state-in-effect */

  /** 重试：带「内容 + 平台 + 失败账号」跳转发布页预填，由用户复核（可修正导致失败的字段）后重新提交。 */
  const handleRetry = (task: TlfTask) => {
    const accountIds = failedLocalAccountIds(task)
    if (accountIds.length === 0) {
      toast.error('未找到可重试的失败账号')
      return
    }
    navigate('/tlf/publish', {
      state: {
        retry: {
          contentId: task.content_id,
          platform: task.platform_code,
          accountIds,
          kind: (task.content_snapshot?.publish_kind as string | undefined) ?? undefined,
        },
      },
    })
  }

  const handleCancel = async () => {
    if (!cancelId) return
    setCancelLoading(true)
    try {
      await tlfApi.cancelTask(cancelId)
      toast.success('任务已取消')
      setCancelId(null)
      await fetchTasks()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '取消失败')
    } finally {
      setCancelLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const target = deleteId
    setDeleteLoading(true)
    try {
      await tlfApi.deleteTask(target)
      // 乐观更新：立即移除该行，不等 refetch（避免抖动）
      setTasks((prev) => prev.filter((t) => t.id !== target))
      toast.success('任务已删除')
      setDeleteId(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '删除失败')
    } finally {
      setDeleteLoading(false)
    }
  }

  const stats = useMemo(() => {
    const counts = { total: tasks.length, success: 0, failed: 0, ongoing: 0 }
    for (const t of tasks) {
      if (t.status === 'success') counts.success++
      else if (t.status === 'failed') counts.failed++
      else if (t.status === 'pending' || t.status === 'publishing') counts.ongoing++
    }
    return counts
  }, [tasks])

  return (
    <PageContainer>
      <PageHeader
        title="任务监控"
        description="跟踪每次发布任务的最终结果与每账号子状态。"
        icon={Activity}
        iconAccent="primary"
        breadcrumbs={[{ label: '创作分发' }, { label: '全球发布' }, { label: '任务监控' }]}
        actions={
          <Button variant="outline" onClick={() => void fetchTasks()}>
            <RefreshCw className="size-4" /> 刷新
          </Button>
        }
      />

      <div className="flex w-full flex-col gap-6">
        {/* 统计卡 */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <StatCard label="总任务" value={stats.total} icon={<Send className="size-5" />} iconColor="text-neon-cyan" index={0} />
          <StatCard label="成功" value={stats.success} icon={<CheckCircle2 className="size-5" />} iconColor="text-neon-green" index={1} />
          <StatCard label="失败" value={stats.failed} icon={<XCircle className="size-5" />} iconColor="text-neon-red" index={2} />
          <StatCard label="进行中" value={stats.ongoing} icon={<Loader2 className="size-5" />} iconColor="text-neon-amber" index={3} />
        </motion.div>

        {/* 列表区 */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card-base overflow-hidden"
        >
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : tasks.length === 0 ? (
            <EmptyState
              title="还没有发布任务"
              description="先去「发布内容」提交一次试试。"
            />
          ) : (
            <div>
              {/* Header */}
              <div className="hidden gap-x-4 border-b border-border/60 bg-muted/30 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid md:grid-cols-[40%_6rem_5rem_7rem_minmax(0,auto)_max-content] md:items-center">
                <span>内容</span>
                <span>平台</span>
                <span>账号</span>
                <span>状态</span>
                <span>结果</span>
                <span>操作</span>
              </div>

              {tasks.map((task, i) => {
                const failItems = (task.result_summary ?? []).filter((r) => r.status === 'failed')
                const isHighlighted = highlightId && task.id === highlightId
                return (
                  <div key={task.id}>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={cn(
                        'flex flex-col gap-3 border-b border-border/60 px-4 py-3 transition-colors hover:bg-muted/40 md:grid md:grid-cols-[40%_6rem_5rem_7rem_minmax(0,auto)_max-content] md:items-center md:gap-x-4 md:py-3.5',
                        isHighlighted && 'bg-primary/[0.06]',
                      )}
                    >
                      <div className="flex min-w-0 flex-col items-stretch gap-0.5 text-left">
                        <button
                          type="button"
                          onClick={() => navigate(`/tlf/tasks/${task.id}`)}
                          className="line-clamp-2 max-w-full cursor-pointer break-words text-left text-sm font-medium text-foreground transition-colors hover:text-primary"
                          title="查看详情"
                        >
                          {(task.content_snapshot?.title as string) || '（未命名）'}
                        </button>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                          <span className="text-muted-foreground/70">{formatDate(task.created_at)}</span>
                          {task.pre_pub_time != null && (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium tabular-nums',
                                task.pre_pub_time > Date.now()
                                  ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300'
                                  : 'border-border bg-muted/40 text-muted-foreground',
                              )}
                              title={task.pre_pub_time > Date.now() ? '定时发布 · 计划时间' : '计划发布时间已过'}
                            >
                              <Clock className="size-3" />
                              定时 {formatDate(new Date(task.pre_pub_time).toISOString())}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex min-w-0 items-center">
                        <PlatformBadge code={task.platform_code} />
                      </div>

                      <div className="flex min-w-0 items-center tabular-nums text-xs text-foreground">
                        {task.success_count}/{task.total_count}
                      </div>

                      <div className="flex min-w-0 items-center">
                        <StatusBadge status={task.status} />
                      </div>

                      <div className="flex min-w-0 items-center">
                        <p className="text-xs tabular-nums md:whitespace-nowrap">
                          <span className="text-text-dim">成功</span>
                          <span className="font-medium text-neon-green">{task.success_count}</span>
                          <span className="text-text-muted/80 px-1.5">/</span>
                          <span className="text-text-dim">失败</span>
                          <span className="font-medium text-neon-red">{task.failed_count}</span>
                          <span className="text-text-muted/80 px-1.5">/</span>
                          <span className="text-text-dim">总分发</span>
                          <span className="font-medium text-text-secondary">{task.total_count}</span>
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5 py-1">
                        <button
                          type="button"
                          onClick={() => navigate(`/tlf/tasks/${task.id}`)}
                          className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-text-muted hover:bg-neon-cyan/[0.08] hover:text-neon-cyan transition-app"
                          title="查看详情"
                        >
                          <ClipboardList className="size-3.5" />
                        </button>
                        {failItems.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === task.id ? null : task.id)}
                            className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted hover:bg-neon-amber/[0.08] hover:text-neon-amber transition-app"
                          >
                            {expandedId === task.id
                              ? <ChevronDown className="size-3.5" />
                              : <ChevronRight className="size-3.5" />}
                            失败
                          </button>
                        )}
                        {(task.status === 'failed' || task.status === 'partial') && (
                          <button
                            type="button"
                            onClick={() => handleRetry(task)}
                            className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted hover:bg-primary/[0.08] hover:text-primary transition-app"
                            title="带内容/平台/失败账号跳转发布页，复核后重新发布"
                          >
                            <RotateCcw className="size-3.5" />
                            重试
                          </button>
                        )}
                        {(task.status === 'pending' || task.status === 'publishing') && (
                          <button
                            type="button"
                            onClick={() => setCancelId(task.id)}
                            className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-text-muted hover:bg-neon-amber/[0.08] hover:text-neon-amber transition-app"
                            title="取消任务"
                          >
                            <XCircle className="size-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteId(task.id)}
                          className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-text-muted hover:bg-neon-red/[0.08] hover:text-neon-red transition-app"
                          title="删除任务"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </motion.div>

                    <AnimatePresence>
                      {expandedId === task.id && failItems.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden border-b border-border/60 bg-destructive/5"
                        >
                          <div className="px-6 py-3">
                            <p className="mb-2 text-xs font-semibold text-destructive">失败详情</p>
                            <div className="space-y-1">
                              {failItems.map((f, idx) => {
                                // 从任务账号快照里按账号匹配到该失败账号的主页 URL（网关已兜底=用户主页或平台首页）
                                const acc = (task.account_snapshot ?? []).find(
                                  (s) => (f.tlfAccountId && s.tlfAccountId === f.tlfAccountId) || (f.accountId && s.id === f.accountId),
                                )
                                const link = acc?.platformHomeUrl
                                  ? { url: acc.platformHomeUrl, isProfile: !!acc.platformHomeUrlIsProfile }
                                  : null
                                const hint = getPublishFailureHint(task.platform_code, f.errorMessage)
                                return (
                                  <div key={idx} className="space-y-1">
                                    <div className="flex flex-wrap items-start gap-2 text-xs text-text-secondary">
                                      <span className="shrink-0 rounded border border-rose-500/25 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-500">
                                        {f.tlfAccountId ?? f.accountId ?? '账号'}
                                      </span>
                                      <span className="flex-1 text-neon-red/80">{f.errorMessage ?? '未知错误'}</span>
                                      {link && (
                                        <a
                                          href={link.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                                        >
                                          前往平台 <ExternalLink className="size-3" />
                                        </a>
                                      )}
                                    </div>
                                    {hint && (
                                      <p className="pl-1 text-[11px] leading-relaxed text-amber-600 dark:text-amber-300">建议：{hint}</p>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>

        <ConfirmDialog
          open={!!cancelId}
          onClose={() => setCancelId(null)}
          onConfirm={handleCancel}
          loading={cancelLoading}
          title="取消任务"
          message="确定要取消该发布任务吗？已上传的内容将停止发布。"
          variant="danger"
        />

        <ConfirmDialog
          open={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={handleDelete}
          loading={deleteLoading}
          title="删除任务"
          message="确定删除该任务记录吗？仅清理本地记录，已在平台发布的内容不会被撤回。"
          variant="danger"
        />
      </div>
    </PageContainer>
  )
}
