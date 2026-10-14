import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  PenLine,
  Layers,
  Palette,
  Plus,
  TrendingUp,
  Wand2,
  Upload,
  Video,
  XCircle,
} from 'lucide-react'

import {
  EmptyState,
  GradientHero,
  IconBox,
  PageContainer,
  SectionCard,
  StatCard,
  type IconBoxAccent,
} from '@/components/shared'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import {
  dashboardApi,
  type DashboardSummary,
  type RecentDocument,
} from '@/api/dashboard'
import { ROUTES } from '@/utils/constants'
import { cn } from '@/utils/helpers'
import { formatRelativeTime } from '@/utils/format'

const EMPTY_STATS: DashboardSummary = {
  documents: 0,
  images: 0,
  videos: 0,
  chats: 0,
  generations: 0,
  recentDocuments: [],
}

type QuickAction = {
  titleKey: string
  fallback: string
  desc: string
  icon: typeof Upload
  to: string
  accent: IconBoxAccent
}

const quickActions: QuickAction[] = [
  {
    titleKey: 'dashboard.uploadDoc',
    fallback: '上传文档',
    desc: '上传 PDF / Word / Markdown 等',
    icon: Upload,
    to: ROUTES.DOCUMENTS,
    accent: 'article',
  },
  {
    titleKey: 'dashboard.newChat',
    fallback: '新建对话',
    desc: 'AI 助手对话，知识检索',
    icon: Plus,
    to: ROUTES.CHAT,
    accent: 'primary',
  },
  {
    titleKey: 'dashboard.genArticle',
    fallback: '生成文章',
    desc: '基于知识库一键生成',
    icon: PenLine,
    to: ROUTES.GENERATION_ARTICLE,
    accent: 'success',
  },
  {
    titleKey: 'dashboard.genImage',
    fallback: '生成图片',
    desc: 'AI 文生图，多样风格',
    icon: Palette,
    to: ROUTES.GENERATION_IMAGE,
    accent: 'video',
  },
]

const STATUS_META: Record<string, { label: string; tone: string; icon: typeof Loader2 }> = {
  pending: { label: '待处理', tone: 'text-muted-foreground', icon: Loader2 },
  processing: { label: '处理中', tone: 'text-sky-500', icon: Loader2 },
  completed: { label: '已完成', tone: 'text-emerald-500', icon: CheckCircle2 },
  failed: { label: '失败', tone: 'text-rose-500', icon: XCircle },
}

function formatFileSize(size: number | null): string {
  if (size == null || size <= 0) return '—'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function RecentDocumentRow({
  doc,
  onClick,
}: {
  doc: RecentDocument
  onClick: () => void
}) {
  const meta = STATUS_META[doc.status] ?? STATUS_META.pending
  const StatusIcon = meta.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FileText className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
          {doc.title || '未命名文档'}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className={cn('inline-flex items-center gap-0.5', meta.tone)}>
            <StatusIcon
              className={cn(
                'size-3',
                (doc.status === 'pending' || doc.status === 'processing') && 'animate-spin',
              )}
            />
            {meta.label}
          </span>
          <span>·</span>
          <span>{formatFileSize(doc.fileSize)}</span>
          {doc.createdAt && (
            <>
              <span>·</span>
              <span>{formatRelativeTime(doc.createdAt)}</span>
            </>
          )}
        </div>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  )
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const displayName = user?.nickname?.trim() || user?.email?.split('@')[0] || ''

  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    dashboardApi
      .summary(5)
      .then((data) => {
        if (cancelled) return
        setSummary(data ?? EMPTY_STATS)
      })
      .catch(() => {
        if (cancelled) return
        // 拉取失败保持空数据，不打扰用户（顶层 axios 已有错误 toast 兜底）
        setSummary(EMPTY_STATS)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const recent = summary.recentDocuments ?? []

  return (
    <PageContainer size="xl">
      <div className="space-y-8">
        {/* Hero */}
        <GradientHero
          eyebrow={today}
          title={
            displayName
              ? `${t('dashboard.title', '欢迎回来')}，${displayName}`
              : t('dashboard.title', '欢迎回来')
          }
          description="继续您的创作工作，今天计划要做些什么？"
          tone="primary"
          actions={
            <>
              <Button variant="outline" onClick={() => navigate(ROUTES.DOCUMENTS)}>
                <Upload className="mr-1.5 size-4" />
                上传文档
              </Button>
              <Button onClick={() => navigate(ROUTES.CHAT)}>
                <Wand2 className="mr-1.5 size-4" />
                打开 AI 助手
              </Button>
            </>
          }
        />

        {/* 数据统计 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard
            title={t('dashboard.documents', '文档')}
            value={summary.documents}
            icon={FileText}
            iconAccent="article"
            onClick={() => navigate(ROUTES.DOCUMENTS)}
          />
          <StatCard
            title={t('dashboard.images', '图片')}
            value={summary.images}
            icon={ImageIcon}
            iconAccent="image"
            onClick={() => navigate(ROUTES.MEDIA_IMAGES)}
          />
          <StatCard
            title={t('dashboard.videos', '视频')}
            value={summary.videos}
            icon={Video}
            iconAccent="video"
            onClick={() => navigate(ROUTES.MEDIA_VIDEOS)}
          />
          <StatCard
            title={t('dashboard.chats', '对话')}
            value={summary.chats}
            icon={MessageSquare}
            iconAccent="audio"
            onClick={() => navigate(ROUTES.CHAT)}
          />
          <StatCard
            title={t('dashboard.generations', '生成')}
            value={summary.generations}
            icon={Layers}
            iconAccent="primary"
            onClick={() => navigate(ROUTES.GENERATION_LIBRARY)}
          />
        </div>

        {/* 快捷操作 */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {t('dashboard.quickActions', '快捷操作')}
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action) => {
              return (
                <button
                  key={action.to}
                  type="button"
                  onClick={() => navigate(action.to)}
                  className="group relative overflow-hidden card-base flex cursor-pointer flex-col items-start gap-4 p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-pop hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <div
                    className="blob-primary pointer-events-none absolute -top-10 -right-10 size-28 opacity-50 transition-opacity duration-300 group-hover:opacity-90"
                    aria-hidden
                  />
                  <IconBox icon={action.icon} accent={action.accent} size="md" className="relative z-10" />
                  <div className="relative z-10 min-w-0 space-y-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {t(action.titleKey, action.fallback)}
                    </span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">
                      {action.desc}
                    </span>
                    <span className="flex items-center gap-1 pt-1 text-xs font-medium text-primary opacity-0 transition-all group-hover:opacity-100">
                      {t('common.go', '前往')}
                      <ArrowRight className="size-3" strokeWidth={2.4} />
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* AI 今日建议 */}
        <SectionCard
          variant="gradient"
          icon={Wand2}
          iconAccent="primary"
          title="AI 今日建议"
          description="根据您的内容资产推荐的下一步动作"
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.CHAT)}>
              问问 AI
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-background/60 p-4">
              <p className="text-sm font-medium text-foreground">📝 完善产品资料</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                上传更多产品文档可显著提升 AI 内容生成质量
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/60 p-4">
              <p className="text-sm font-medium text-foreground">🎬 尝试视频生成</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                体验基于现有素材一键生成宣传视频
              </p>
            </div>
          </div>
        </SectionCard>

        {/* 最近文档 */}
        <SectionCard
          variant="elevated"
          icon={TrendingUp}
          iconAccent="primary"
          title={t('dashboard.recentDocs', '最近文档')}
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.DOCUMENTS)}>
              查看全部
              <ArrowRight className="ml-1 size-3.5" />
            </Button>
          }
          bodyClassName="p-2"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('common.loading', '加载中…')}
            </div>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={t('common.noData', '暂无数据')}
              description={t('dashboard.recentDocsEmpty', '上传或生成内容后会在此处显示')}
              action={
                <Button onClick={() => navigate(ROUTES.DOCUMENTS)}>
                  <Upload className="mr-1.5 size-4" />
                  {t('dashboard.uploadDoc', '上传文档')}
                </Button>
              }
            />
          ) : (
            <div className="space-y-0.5">
              {recent.map((doc) => (
                <RecentDocumentRow
                  key={doc.id}
                  doc={doc}
                  onClick={() => navigate(`${ROUTES.DOCUMENTS}/${doc.id}`)}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </PageContainer>
  )
}
