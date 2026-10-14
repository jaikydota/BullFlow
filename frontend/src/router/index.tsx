import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, useRouteError } from 'react-router-dom'
import { Loader2, RefreshCw, Rocket } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const LegalPage = lazy(() => import('@/pages/legal/LegalPage'))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const CompanyPage = lazy(() => import('@/pages/knowledge/CompanyPage'))
const BrandPage = lazy(() => import('@/pages/knowledge/BrandPage'))
const ProductPage = lazy(() => import('@/pages/knowledge/ProductPage'))
const CustomerPage = lazy(() => import('@/pages/knowledge/CustomerPage'))
const CasePage = lazy(() => import('@/pages/knowledge/CasePage'))
const KnowledgeSearchPage = lazy(() => import('@/pages/knowledge/KnowledgeSearchPage'))
const UnifiedSearchPage = lazy(() => import('@/pages/knowledge/UnifiedSearchPage'))
const DocumentListPage = lazy(() => import('@/pages/documents/DocumentListPage'))
const DocumentDetailPage = lazy(() => import('@/pages/documents/DocumentDetailPage'))
const ImagesPage = lazy(() => import('@/pages/media/ImagesPage'))
const VideosPage = lazy(() => import('@/pages/media/VideosPage'))
const AudiosPage = lazy(() => import('@/pages/media/AudiosPage'))
const ChatPage = lazy(() => import('@/pages/chat/ChatPage'))
const ArticlePage = lazy(() => import('@/pages/generation/ArticlePage'))
const ImageGenPage = lazy(() => import('@/pages/generation/ImageGenPage'))
const VideoGenPage = lazy(() => import('@/pages/generation/VideoGenPage'))
const ContentLibraryPage = lazy(() => import('@/pages/generation/ContentLibraryPage'))
const GeneratedContentDetailPage = lazy(
  () => import('@/pages/generation/GeneratedContentDetailPage'),
)
const AutoGenSchedulePage = lazy(() => import('@/pages/generation/AutoGenSchedulePage'))
const ScheduleEditorPage = lazy(() => import('@/pages/generation/ScheduleEditorPage'))
const TlfAccountsPage = lazy(() => import('@/pages/tlf/AccountsPage'))
const TlfPublishPage = lazy(() => import('@/pages/tlf/PublishPage'))
const TlfTaskMonitorPage = lazy(() => import('@/pages/tlf/TaskMonitorPage'))
const TlfTaskDetailPage = lazy(() => import('@/pages/tlf/TaskDetailPage'))
const ReviewDashboardPage = lazy(() => import('@/pages/review/DashboardPage'))
const ReviewContentPage = lazy(() => import('@/pages/review/ContentPage'))
const ReviewChannelsPage = lazy(() => import('@/pages/review/ChannelsPage'))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'))
const PricingPage = lazy(() => import('@/pages/pricing/PricingPage'))
const SubscriptionPage = lazy(() => import('@/pages/account/SubscriptionPage'))
const BillingDetailsPage = lazy(() => import('@/pages/account/BillingDetailsPage'))
const NotificationsPage = lazy(() => import('@/pages/account/NotificationsPage'))
const FeedbackPage = lazy(() => import('@/pages/feedback/FeedbackPage'))
const ReferralPage = lazy(() => import('@/pages/referral/ReferralPage'))
const NotFoundPage = lazy(() => import('@/pages/errors/NotFoundPage'))
const ForbiddenPage = lazy(() => import('@/pages/errors/ForbiddenPage'))

function RouteFallback() {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background">
      <Loader2 className="size-8 animate-spin text-primary" />
    </div>
  )
}

function withSuspense(node: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>
}

/** 判断是否「懒加载分片加载失败」——新版本部署后旧 hash 分片 404 的典型错误。 */
function isChunkLoadError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('failed to fetch') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('chunk') && msg.includes('failed') ||
    msg.includes('unable to preload') ||
    msg.includes('load failed')
  )
}

/**
 * 路由级错误兜底：分片加载失败（多为刚发了新版本）时自动刷新一次拉取最新 index.html，
 * 用 sessionStorage 时间戳防止刷新风暴；其它错误展示友好提示 + 手动刷新。
 */
function RouteError() {
  const error = useRouteError()
  const chunk = isChunkLoadError(error)

  useEffect(() => {
    if (!chunk) return
    const KEY = 'chunk_reload_at'
    const last = Number(sessionStorage.getItem(KEY) || '0')
    if (Date.now() - last > 10000) {
      sessionStorage.setItem(KEY, String(Date.now()))
      window.location.reload()
    }
  }, [chunk])

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-background p-6">
      {/* 装饰光斑 */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="blob-primary animate-blob absolute -top-40 -left-32 size-[28rem]" />
        <div
          className="blob-sky animate-blob absolute -bottom-32 -right-24 size-[24rem]"
          style={{ animationDelay: '8s' }}
        />
        <div
          className="blob-rose animate-blob absolute top-1/3 right-1/4 size-[16rem] opacity-60"
          style={{ animationDelay: '4s' }}
        />
      </div>

      <div className="gradient-border glass-strong relative w-full max-w-md overflow-hidden rounded-2xl p-8 text-center shadow-[0_24px_60px_-20px_oklch(0.55_0.25_285_/_0.25)]">
        {/* 卡片顶部柔光 */}
        <div
          className="blob-primary pointer-events-none absolute -top-16 left-1/2 size-40 -translate-x-1/2 opacity-60"
          aria-hidden
        />

        <div className="relative z-10 flex flex-col items-center gap-6">
          {/* 图标徽标 */}
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-pink-400/20 text-primary shadow-glow ring-1 ring-primary/25">
            <Rocket className="size-8" strokeWidth={2.1} />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="text-gradient">发现新版本</span>
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              点击刷新即可加载最新版本，体验全新内容。
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              // 开发预览路由：无真实错误，reload 会停在预览页，故直接跳首页；
              // 线上真实错误页：reload 当前 URL 以拉取最新版本恢复目标页面。
              if (window.location.pathname === '/__error-preview') {
                window.location.href = '/'
              } else {
                window.location.reload()
              }
            }}
            className="group inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-pop transition-all hover:-translate-y-0.5 hover:shadow-glow active:translate-y-0"
          >
            <RefreshCw
              className="size-4 transition-transform duration-500 group-hover:rotate-180"
              strokeWidth={2.3}
            />
            刷新页面
          </button>

          {chunk && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
              <Loader2 className="size-3 animate-spin" />
              正在为你自动刷新…
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export const router = createBrowserRouter([
  // 仅开发环境：预览「发现新版本」错误页样式 —— 访问 /__error-preview
  ...(import.meta.env.DEV
    ? [{ path: '/__error-preview', element: <RouteError /> }]
    : []),
  {
    path: '/login',
    element: withSuspense(<LoginPage />),
    errorElement: <RouteError />,
  },
  {
    path: '/register',
    element: withSuspense(<RegisterPage />),
    errorElement: <RouteError />,
  },
  {
    path: '/forgot-password',
    element: withSuspense(<ForgotPasswordPage />),
    errorElement: <RouteError />,
  },
  {
    // 用户协议 / 隐私政策独立阅读页（公开，新标签页打开）：/legal/agreement | /legal/privacy
    path: '/legal/:doc',
    element: withSuspense(<LegalPage />),
    errorElement: <RouteError />,
  },
  {
    // 公开价格表：未登录可访问；如已登录则进入 AppLayout 包裹版（带 sidebar）
    path: '/pricing',
    element: withSuspense(<PricingPage />),
    errorElement: <RouteError />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/chat" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },

      // 资产管理
      { path: 'knowledge/companies', element: <CompanyPage /> },
      { path: 'knowledge/brands', element: <BrandPage /> },
      { path: 'knowledge/products', element: <ProductPage /> },
      { path: 'knowledge/customers', element: <CustomerPage /> },
      { path: 'knowledge/cases', element: <CasePage /> },
      { path: 'knowledge/search', element: <KnowledgeSearchPage /> },
      { path: 'knowledge/finder', element: <UnifiedSearchPage /> },
      { path: 'documents', element: <DocumentListPage /> },
      { path: 'documents/:id', element: <DocumentDetailPage /> },
      { path: 'media/images', element: <ImagesPage /> },
      { path: 'media/videos', element: <VideosPage /> },
      { path: 'media/audios', element: <AudiosPage /> },

      // 创作分发
      { path: 'chat', element: <ChatPage /> },
      { path: 'chat/:sessionId', element: <ChatPage /> },
      { path: 'generation/article', element: <ArticlePage /> },
      { path: 'generation/image', element: <ImageGenPage /> },
      { path: 'generation/video', element: <VideoGenPage /> },
      { path: 'generation/library', element: <ContentLibraryPage /> },
      { path: 'generation/library/:id', element: <GeneratedContentDetailPage /> },
      { path: 'generation/auto-schedule', element: <AutoGenSchedulePage /> },
      { path: 'generation/auto-schedule/new', element: <ScheduleEditorPage /> },
      { path: 'generation/auto-schedule/edit/:id', element: <ScheduleEditorPage /> },

      // 国内分发
      { path: 'tlf/accounts', element: <TlfAccountsPage /> },
      { path: 'tlf/publish', element: <TlfPublishPage /> },
      { path: 'tlf/tasks', element: <TlfTaskMonitorPage /> },
      { path: 'tlf/tasks/:id', element: <TlfTaskDetailPage /> },

      // 数据分析
      { path: 'review/dashboard', element: <ReviewDashboardPage /> },
      { path: 'review/content', element: <ReviewContentPage /> },
      { path: 'review/channels', element: <ReviewChannelsPage /> },

      // 系统
      { path: 'settings', element: <SettingsPage /> },
      { path: 'feedback', element: <FeedbackPage /> },
      { path: 'referral', element: <ReferralPage /> },

      // 订阅与账单
      { path: 'account/subscription', element: <SubscriptionPage /> },
      { path: 'account/billing-details', element: <BillingDetailsPage /> },
      { path: 'account/notifications', element: <NotificationsPage /> },
    ],
  },
  {
    path: '/403',
    element: withSuspense(<ForbiddenPage />),
    errorElement: <RouteError />,
  },
  {
    path: '*',
    element: withSuspense(<NotFoundPage />),
    errorElement: <RouteError />,
  },
])
