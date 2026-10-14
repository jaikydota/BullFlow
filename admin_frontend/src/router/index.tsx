import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { AdminLayout } from '@/components/layout/AdminLayout'

const LoginPage = lazy(() => import('@/pages/login/LoginPage'))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const AnalyticsPage = lazy(() => import('@/pages/analytics/AnalyticsPage'))
const FinancePage = lazy(() => import('@/pages/finance/FinancePage'))
const UsersPage = lazy(() => import('@/pages/users/UsersPage'))
const RolesPage = lazy(() => import('@/pages/roles/RolesPage'))
const SalesPage = lazy(() => import('@/pages/sales/SalesPage'))
const FinanceTeamPage = lazy(() => import('@/pages/finance/FinanceTeamPage'))
const SalesDashboardPage = lazy(() => import('@/pages/sales/SalesDashboardPage'))
const PlansPage = lazy(() => import('@/pages/plans/PlansPage'))
const OrdersPage = lazy(() => import('@/pages/orders/OrdersPage'))
const InvoicesPage = lazy(() => import('@/pages/invoices/InvoicesPage'))
const BillingPage = lazy(() => import('@/pages/billing/BillingPage'))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'))
const BroadcastsPage = lazy(() => import('@/pages/broadcasts/BroadcastsPage'))
const NotificationsPage = lazy(() => import('@/pages/notifications/NotificationsPage'))
const FeedbackPage = lazy(() => import('@/pages/feedback/FeedbackPage'))
const TrafficPasswordPage = lazy(() => import('@/pages/traffic-password/TrafficPasswordPage'))
const SkillsPage = lazy(() => import('@/pages/skills/SkillsPage'))
const LogsPage = lazy(() => import('@/pages/logs/LogsPage'))
const TrackingOverviewPage = lazy(() => import('@/pages/tracking/OverviewPage'))
const TrackingFunnelPage = lazy(() => import('@/pages/tracking/FunnelPage'))
const TrackingCreationPage = lazy(() => import('@/pages/tracking/CreationPage'))
const TrackingPaymentPage = lazy(() => import('@/pages/tracking/PaymentPage'))
const TrackingEventsPage = lazy(() => import('@/pages/tracking/EventsPage'))

function PageLoader() {
  return (
    <div className="flex h-full flex-1 items-center justify-center">
      <Loader2 className="size-6 animate-spin text-primary" strokeWidth={2.25} />
    </div>
  )
}

function withSuspense(node: React.ReactNode) {
  return <Suspense fallback={<PageLoader />}>{node}</Suspense>
}

export const router = createBrowserRouter([
  // 公开路由（不需要登录）
  {
    path: '/admin/login',
    element: withSuspense(<LoginPage />),
  },
  // 入口跳 dashboard
  { path: '/', element: <Navigate to="/admin/dashboard" replace /> },
  { path: '/admin', element: <Navigate to="/admin/dashboard" replace /> },

  // 主布局保护路由
  {
    element: <AdminLayout />,
    children: [
      { path: '/admin/dashboard', element: withSuspense(<DashboardPage />) },
      { path: '/admin/analytics', element: withSuspense(<AnalyticsPage />) },
      { path: '/admin/finance', element: withSuspense(<FinancePage />) },
      { path: '/admin/users', element: withSuspense(<UsersPage />) },
      { path: '/admin/roles', element: withSuspense(<RolesPage />) },
      { path: '/admin/sales', element: withSuspense(<SalesPage />) },
      { path: '/admin/finance-team', element: withSuspense(<FinanceTeamPage />) },
      { path: '/admin/sales-dashboard', element: withSuspense(<SalesDashboardPage />) },
      { path: '/admin/plans', element: withSuspense(<PlansPage />) },
      { path: '/admin/orders', element: withSuspense(<OrdersPage />) },
      { path: '/admin/invoices', element: withSuspense(<InvoicesPage />) },
      { path: '/admin/billing', element: withSuspense(<BillingPage />) },
      { path: '/admin/settings', element: withSuspense(<SettingsPage />) },
      { path: '/admin/broadcasts', element: withSuspense(<BroadcastsPage />) },
      { path: '/admin/notifications', element: withSuspense(<NotificationsPage />) },
      { path: '/admin/feedback', element: withSuspense(<FeedbackPage />) },
      { path: '/admin/traffic-password', element: withSuspense(<TrafficPasswordPage />) },
      { path: '/admin/skills', element: withSuspense(<SkillsPage />) },
      { path: '/admin/logs', element: withSuspense(<LogsPage />) },
      { path: '/admin/tracking/overview', element: withSuspense(<TrackingOverviewPage />) },
      { path: '/admin/tracking/funnel', element: withSuspense(<TrackingFunnelPage />) },
      { path: '/admin/tracking/creation', element: withSuspense(<TrackingCreationPage />) },
      { path: '/admin/tracking/payment', element: withSuspense(<TrackingPaymentPage />) },
      { path: '/admin/tracking/events', element: withSuspense(<TrackingEventsPage />) },
    ],
  },

  // 404 fallback
  { path: '*', element: <Navigate to="/admin/dashboard" replace /> },
])
