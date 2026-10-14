import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clapperboard,
  ExternalLink,
  FileText,
  Hash,
  ImageIcon,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Maximize2,
  Send,
  ShieldAlert,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/components/common/Toast'
import { PageContainer } from '@/components/shared/PageContainer'
import { ArticlePreviewModal } from '@/components/common/ArticlePreviewModal'
import { MediaPreview } from '@/components/common/MediaPreview'
import { PlatformBadge } from '@/components/tlf/PlatformBadge'
import { tlfApi } from '@/api/tlf'
import { generationApi } from '@/api/generation'
import { getPlatformName } from '@/utils/tlfPlatforms'
import { getPublishFailureHint, isDouyinPublishRiskError } from '@/utils/tlfPlatformUrls'
import { RiskControlDialog, type RiskAccountRef } from '@/components/tlf/RiskControlDialog'
import type {
  TlfAccountSnapshot,
  TlfResultItem,
  TlfTask,
  TlfTaskStatus,
} from '@/types/tlf'
import type { GeneratedContent } from '@/types/generation'
import { ApiError } from '@/types/api'
import { formatDate } from '@/utils/format'
import { cn } from '@/lib/utils'

const STATUS_META: Record<
  TlfTaskStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon?: React.ReactNode }
> = {
  pending: { label: '排队中', variant: 'outline' },
  publishing: { label: '发布中', variant: 'secondary', icon: <Loader2 className="size-3 animate-spin" /> },
  success: { label: '全部成功', variant: 'default', icon: <CheckCircle2 className="size-3" /> },
  partial: { label: '部分成功', variant: 'secondary', icon: <AlertCircle className="size-3" /> },
  failed: { label: '失败', variant: 'destructive', icon: <XCircle className="size-3" /> },
  cancelled: { label: '已取消', variant: 'outline' },
}

const STAGE_LABEL: Record<string, string> = {
  upload: '上传',
  push: '推送',
  transcoding: '转码',
  review: '审核',
  scheduled: '定时',
  success: '已发布',
  notfound: '未找到作品',
  doing: '进行中',
  fail: '失败',
}

function SectionCard({
  title,
  icon,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card shadow-soft', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b px-5 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground/85">
            {icon}
            {title}
          </span>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-24 shrink-0 text-muted-foreground/70">{label}</span>
      <span className="flex-1 break-all text-foreground/85">{value}</span>
    </div>
  )
}

function contentTypeLabel(t: string | undefined): string {
  switch (t) {
    case 'article':
      return '文章'
    case 'image':
      return '图片'
    case 'video':
      return '视频'
    default:
      return '—'
  }
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  article: <FileText className="size-4" />,
  image: <ImageIcon className="size-4" />,
  video: <Clapperboard className="size-4" />,
}

export default function TlfTaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [task, setTask] = useState<TlfTask | null>(null)
  const [content, setContent] = useState<GeneratedContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [showMediaPreview, setShowMediaPreview] = useState(false)
  const [showArticlePreview, setShowArticlePreview] = useState(false)
  const [riskAccount, setRiskAccount] = useState<RiskAccountRef | null>(null)

  const loadTask = useCallback(async () => {
    if (!id) return
    try {
      const t = await tlfApi.getTask(id)
      setTask(t)
      if (t.content_id) {
        try {
          const c = await generationApi.get(t.content_id)
          setContent(c)
        } catch {
          /* 内容已删除，使用 snapshot */
        }
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '加载任务失败')
    }
  }, [id])

  useEffect(() => {
    setLoading(true)
    void loadTask().finally(() => setLoading(false))
  }, [loadTask])

  // 进行中任务每 10s 自动刷新
  useEffect(() => {
    if (!task) return
    if (task.status !== 'pending' && task.status !== 'publishing') return
    const t = setInterval(() => {
      void loadTask()
    }, 10_000)
    return () => clearInterval(t)
  }, [task, loadTask])

  const handleCancel = async () => {
    if (!task) return
    setActionLoading(true)
    try {
      await tlfApi.cancelTask(task.id)
      toast.success('任务已取消')
      setTask((prev) => (prev ? { ...prev, status: 'cancelled' } : prev))
      setConfirmCancel(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '取消失败')
    } finally {
      setActionLoading(false)
    }
  }

  // 汇总：从 account_snapshot + result_summary 合成每账号视图
  const accountRows = useMemo(() => {
    if (!task) return []
    const snapshot = (task.account_snapshot ?? []) as TlfAccountSnapshot[]
    const results = (task.result_summary ?? []) as TlfResultItem[]
    return snapshot.map((s) => {
      const r = results.find(
        (x) => x.subTaskId === s.subTaskId || x.accountId === s.id || x.tlfAccountId === s.tlfAccountId,
      )
      return { snapshot: s, result: r }
    })
  }, [task])

  /* ── loading / not found ── */
  if (loading) {
    return (
      <PageContainer>
        <div className="space-y-6">
          <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="h-80 rounded-xl border bg-muted animate-pulse" />
            <div className="h-80 rounded-xl border bg-muted animate-pulse" />
          </div>
        </div>
      </PageContainer>
    )
  }

  if (!task) {
    return (
      <PageContainer>
        <div className="py-20 text-center text-muted-foreground">任务不存在或已被删除</div>
      </PageContainer>
    )
  }

  const statusCfg = STATUS_META[task.status] ?? { label: task.status, variant: 'outline' as const }
  const snapshot = task.content_snapshot as Record<string, unknown> | null
  const contentType = (snapshot?.type as string) ?? content?.type
  const isArticle = contentType === 'article'
  const isImage = contentType === 'image'
  const isVideo = contentType === 'video'
  const filePath =
    content?.file_path || (snapshot?.file_path as string | undefined) || null
  const thumbPath =
    content?.thumbnail_path || (snapshot?.thumbnail_path as string | undefined) || null

  const canCancel = task.status === 'pending' || task.status === 'publishing'
  const platformName = getPlatformName(task.platform_code)
  const articleText = content?.content || (snapshot?.summary as string | undefined) || ''

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* 返回 */}
        <button
          type="button"
          onClick={() => navigate('/tlf/tasks')}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-4" />
          返回任务监控
        </button>

        {/* 头部 */}
        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-pink-500/20 ring-1 ring-primary/25">
              <Send className="size-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Badge variant={statusCfg.variant} className="gap-1">
                  {statusCfg.icon}
                  {statusCfg.label}
                </Badge>
                <PlatformBadge code={task.platform_code} />
                {task.pre_pub_time != null && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium tabular-nums',
                      task.pre_pub_time > Date.now()
                        ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300'
                        : 'border-border bg-muted/40 text-muted-foreground',
                    )}
                    title={task.pre_pub_time > Date.now() ? '定时发布 · 等待时间到达' : '计划发布时间已过'}
                  >
                    <Activity className="size-3" />
                    定时 {formatDate(new Date(task.pre_pub_time).toISOString())}
                  </span>
                )}
              </div>
              <h1 className="line-clamp-2 break-all text-xl font-semibold leading-tight tracking-tight text-foreground">
                {(snapshot?.title as string) || content?.title || '无标题'}
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground/80">
                创建于 {formatDate(task.created_at)} · id <code className="font-mono">{task.id.slice(0, 8)}</code>
              </p>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadTask()}
              className="cursor-pointer"
            >
              <RefreshCw className="size-4" />
              刷新
            </Button>
            {isArticle && articleText && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowArticlePreview(true)}
                className="cursor-pointer"
              >
                <FileText className="size-4" />
                预览文章
              </Button>
            )}
            {(isImage || isVideo) && filePath && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMediaPreview(true)}
                className="cursor-pointer"
              >
                <Play className="size-4" />
                {isImage ? '预览图片' : '播放视频'}
              </Button>
            )}
            {canCancel && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmCancel(true)}
                className="cursor-pointer"
              >
                <XCircle className="size-4" />
                取消任务
              </Button>
            )}
          </div>
        </motion.header>

        {/* 主体：左右布局 */}
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* ── 左栏：内容预览 + 账号结果 ── */}
          <div className="space-y-5">
            {/* 图片 / 视频预览 */}
            {(isImage || isVideo) && filePath && (
              <SectionCard
                title={isImage ? '图片预览' : '视频预览'}
                icon={TYPE_ICON[contentType ?? '']}
              >
                {isImage ? (
                  <button
                    type="button"
                    onClick={() => setShowMediaPreview(true)}
                    className="block w-full cursor-pointer overflow-hidden rounded-lg border bg-muted/40"
                  >
                    <img
                      src={thumbPath || filePath}
                      alt=""
                      className="max-h-[440px] w-full object-contain transition hover:opacity-90"
                      loading="lazy"
                    />
                  </button>
                ) : thumbPath ? (
                  <button
                    type="button"
                    onClick={() => setShowMediaPreview(true)}
                    className="relative block w-full cursor-pointer overflow-hidden rounded-lg border bg-black"
                  >
                    <img src={thumbPath} alt="" className="max-h-[360px] w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/20">
                      <div className="flex size-14 items-center justify-center rounded-full bg-black/60 ring-2 ring-rose-500/40">
                        <Play className="size-7 translate-x-0.5 text-white" />
                      </div>
                    </div>
                  </button>
                ) : (
                  <video
                    src={filePath}
                    controls
                    className="max-h-[360px] w-full rounded-lg bg-black"
                    preload="metadata"
                  />
                )}
              </SectionCard>
            )}

            {/* 文章正文 */}
            {isArticle && (
              <SectionCard
                title="文章正文"
                icon={<FileText className="size-4 text-muted-foreground/70" />}
                actions={
                  articleText ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowArticlePreview(true)}
                      className="cursor-pointer"
                    >
                      <Maximize2 className="size-3.5" />
                      全屏预览
                    </Button>
                  ) : null
                }
              >
                {articleText ? (
                  <div className="max-h-[440px] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                    {articleText}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground/70">暂无文章内容</p>
                )}
              </SectionCard>
            )}

            {/* 顶层任务级错误（罕见） */}
            {task.error_message && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                <p className="mb-1 flex items-center gap-1.5 font-semibold">
                  <XCircle className="size-4" /> 任务错误
                </p>
                <p className="whitespace-pre-wrap text-xs">{task.error_message}</p>
              </div>
            )}

            {/* 账号发布详情：每账号一卡片，展示进度 / 审核 / 链接 / 错误 */}
            <SectionCard
              title={`账号发布详情（${accountRows.length}）`}
              icon={<Activity className="size-4 text-muted-foreground/70" />}
            >
              {accountRows.length === 0 ? (
                <p className="text-sm text-muted-foreground/70">暂无账号信息</p>
              ) : (
                <ul className="space-y-3">
                  {accountRows.map(({ snapshot: s, result: r }) => {
                    const finalStatus = r?.status ?? (task.status === 'publishing' ? 'publishing' : '—')
                    const isOk = finalStatus === 'success'
                    const isFail = finalStatus === 'failed' || finalStatus === 'fail'
                    const isInflight = finalStatus === 'publishing'
                    const audit = r?.audit
                    const progress = r?.progress
                    const openUrl = r?.openUrl || audit?.openUrl
                    // 跳转目标（与昵称/状态同行展示，不单开一行）：
                    // 有作品链接→查看作品；否则终态→主页（优先快照真实 URL，再按规律拼，再退平台站点）
                    const jump: { href: string; label: string } | null = openUrl
                      ? { href: openUrl, label: '查看作品' }
                      : (isOk || isFail)
                        ? (() => {
                            // 网关已兜底：platformHomeUrl = 用户主页或平台首页，isProfile 标明是哪种
                            const link = s.platformHomeUrl
                              ? { url: s.platformHomeUrl, isProfile: !!s.platformHomeUrlIsProfile }
                              : null
                            return link
                              ? { href: link.url, label: link.isProfile ? '查看主页' : '前往平台' }
                              : null
                          })()
                        : null
                    return (
                      <li
                        key={s.id}
                        className={cn(
                          'rounded-lg border bg-card p-3.5',
                          isFail && 'border-rose-200 bg-rose-50/40 dark:border-rose-500/30 dark:bg-rose-500/5',
                          isOk && 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/5',
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="size-9 shrink-0">
                            {s.platformAvatar && <AvatarImage src={s.platformAvatar} alt={s.platformUserName ?? ''} />}
                            <AvatarFallback>{(s.platformUserName ?? s.platformUserId).slice(0, 1)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium">
                                {s.platformUserName ?? s.platformUserId}
                              </p>
                              {/* 跳转链接紧跟昵称后面（查看作品 / 查看主页 / 前往平台） */}
                              {jump && (
                                <a
                                  href={jump.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                                >
                                  {jump.label} <ExternalLink className="size-3" />
                                </a>
                              )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground/80">
                              {s.platformUserId}
                            </p>
                          </div>
                          <Badge
                            variant={
                              isOk ? 'default' : isFail ? 'destructive' : isInflight ? 'secondary' : 'outline'
                            }
                            className="gap-1"
                          >
                            {isOk && <CheckCircle2 className="size-3" />}
                            {isFail && <XCircle className="size-3" />}
                            {isInflight && <Loader2 className="size-3 animate-spin" />}
                            {isOk ? '成功' : isFail ? '失败' : isInflight ? '发布中' : '等待'}
                          </Badge>
                        </div>

                        {/* 上传 / 推送进度 —— 仅在 publishing / pending 阶段展示
                              终态(success/failed)下隐藏，避免迟到的 webhook 反向显示「进行中」 */}
                        {progress && !isOk && !isFail && (
                          <div className="mt-2.5 flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                            <Loader2
                              className={cn(
                                'size-3',
                                progress.stageStatus === 'doing' && 'animate-spin',
                                progress.stageStatus === 'success' && 'text-emerald-600',
                                progress.stageStatus === 'fail' && 'text-rose-600',
                              )}
                            />
                            阶段：{STAGE_LABEL[progress.stage ?? ''] ?? progress.stage} / {STAGE_LABEL[progress.stageStatus ?? ''] ?? progress.stageStatus}
                            {!!(progress.totalParts && progress.totalParts > 0) && (
                              <span className="tabular-nums">
                                {progress.uploadedParts ?? 0} / {progress.totalParts}
                              </span>
                            )}
                          </div>
                        )}

                        {/* 平台审核进度 —— 终态成功时仍可显示审核详情（如「审核通过」），
                              终态失败时隐藏 audit 以减少噪声 */}
                        {audit && !isFail && (
                          <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                            <Activity className="size-3" />
                            审核：{STAGE_LABEL[audit.stage ?? ''] ?? audit.stage} / {STAGE_LABEL[audit.stageStatus ?? ''] ?? audit.stageStatus}
                          </div>
                        )}

                        {/* 错误信息 */}
                        {(r?.errorMessage || audit?.errorMessage) && (
                          <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-300">
                            <AlertCircle className="mt-0.5 size-3 shrink-0" />
                            {r?.errorMessage || audit?.errorMessage}
                          </p>
                        )}

                        {/* 抖音风控类失败 → 直接在站内走「解除发布风控」 */}
                        {isDouyinPublishRiskError(task.platform_code, r?.errorMessage || audit?.errorMessage) && (
                          <button
                            type="button"
                            onClick={() => setRiskAccount({
                              id: s.id,
                              platform_code: task.platform_code,
                              platform_user_name: s.platformUserName,
                              platform_user_id: s.platformUserId,
                            })}
                            className="mt-1.5 inline-flex cursor-pointer items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                          >
                            <ShieldAlert className="size-3.5" /> 解除发布风控
                          </button>
                        )}

                        {/* 平台/账号侧失败的可操作建议（去平台手动发 / 重新扫码等） */}
                        {(() => {
                          const hint = getPublishFailureHint(task.platform_code, r?.errorMessage || audit?.errorMessage)
                          if (!hint) return null
                          return (
                            <p className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                              建议：{hint}
                            </p>
                          )
                        })()}

                        {/* 发布 ID */}
                        {r?.publishId && (
                          <p className="mt-1.5 text-[10px] text-muted-foreground/70">
                            publishId: <code className="font-mono">{r.publishId}</code>
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </SectionCard>
          </div>

          {/* ── 右栏：统计 + 元数据 + 内容来源 ── */}
          <aside className="space-y-5">
            {/* 结果统计 */}
            {task.status !== 'pending' && task.status !== 'cancelled' && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '总账号', value: task.total_count, color: 'text-foreground' },
                  { label: '成功', value: task.success_count, color: 'text-emerald-600 dark:text-emerald-400' },
                  { label: '失败', value: task.failed_count, color: 'text-rose-600' },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border bg-card p-3 text-center shadow-soft">
                    <p className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground/70">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 任务信息 */}
            <SectionCard title="任务信息" icon={<Info className="size-4 text-muted-foreground/70" />}>
              <div className="space-y-2">
                <MetaRow label="目标平台" value={platformName} />
                <MetaRow label="内容类型" value={contentTypeLabel(contentType)} />
                <MetaRow label="创建时间" value={formatDate(task.created_at)} />
                <MetaRow label="更新时间" value={formatDate(task.updated_at)} />
                <MetaRow
                  label="发布时间"
                  value={
                    task.pre_pub_time != null
                      ? `${formatDate(new Date(task.pre_pub_time).toISOString())}（定时${task.pre_pub_time > Date.now() ? '·等待中' : '·已到时'}）`
                      : '立即发布'
                  }
                />
                {task.tlf_operation_id && (
                  <MetaRow
                    label="云端操作 ID"
                    value={<code className="font-mono text-[11px]">{task.tlf_operation_id}</code>}
                  />
                )}
                <MetaRow
                  label="本地 ID"
                  value={<code className="font-mono text-[11px]">{task.id}</code>}
                />
              </div>
            </SectionCard>

            {/* 账号简表 */}
            <SectionCard
              title={`关联账号（${accountRows.length}）`}
              icon={<Users className="size-4 text-muted-foreground/70" />}
            >
              <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {accountRows.map(({ snapshot: s }) => (
                  <li key={s.id} className="flex items-center gap-2 text-xs">
                    <Avatar className="size-6 shrink-0">
                      {s.platformAvatar && <AvatarImage src={s.platformAvatar} alt="" />}
                      <AvatarFallback>{(s.platformUserName ?? s.platformUserId).slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate font-medium">
                      {s.platformUserName ?? s.platformUserId}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>

            {/* 内容来源 */}
            <SectionCard title="内容来源" icon={<Hash className="size-4 text-muted-foreground/70" />}>
              {task.content_id ? (
                content ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/generation/library/${task.content_id}`)}
                    className="flex w-full cursor-pointer items-start gap-2 rounded-md border bg-card px-3 py-2 text-left text-xs transition hover:border-primary/40 hover:bg-accent"
                  >
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded text-primary">
                      {TYPE_ICON[content.type] ?? <FileText className="size-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 font-medium">{content.title || '未命名'}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                        {contentTypeLabel(content.type)} · 点击查看
                      </p>
                    </div>
                    <ExternalLink className="mt-1 size-3 shrink-0 text-muted-foreground/60" />
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground/70">
                    原始内容已删除，以下为发布时快照：
                    <br />
                    <span className="text-foreground/85">{(snapshot?.title as string) || '—'}</span>
                  </p>
                )
              ) : (
                <p className="text-xs text-muted-foreground/70">未关联内容库</p>
              )}
            </SectionCard>
          </aside>
        </div>
      </div>

      {/* 确认取消 */}
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>取消此任务？</AlertDialogTitle>
            <AlertDialogDescription>
              将仅在本地标记 cancelled；已提交至云端的发布可能继续执行（暂不支持远端取消）。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">关闭</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleCancel()}
              disabled={actionLoading}
              className="cursor-pointer"
            >
              <Trash2 className="size-4" /> 确认取消
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 媒体预览 */}
      {showMediaPreview && filePath && (
        <MediaPreview
          url={filePath}
          type={isVideo ? 'video' : 'image'}
          alt={(snapshot?.title as string) || ''}
          onClose={() => setShowMediaPreview(false)}
        />
      )}

      {/* 文章预览 */}
      {showArticlePreview && articleText && (
        <ArticlePreviewModal
          content={articleText}
          title={(snapshot?.title as string) || content?.title || '文章'}
          onClose={() => setShowArticlePreview(false)}
        />
      )}

      {/* 抖音发布风控解除 */}
      <RiskControlDialog
        open={!!riskAccount}
        onOpenChange={(o) => !o && setRiskAccount(null)}
        account={riskAccount}
      />
    </PageContainer>
  )
}
