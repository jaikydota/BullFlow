import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'

import { AdminRequireAuth } from './AdminRequireAuth'
import { AdminSidebar } from './AdminSidebar'
import { AdminHeader } from './AdminHeader'
import { RoleBadge } from './RoleBadge'
import { useAdminAuthStore } from '@/stores/adminAuthStore'
import { Button } from '@/components/ui/button'

const SALES_HOME = '/admin/sales-dashboard'

/** 财务角色首页 + 可访问路由前缀（订单核销 + 财务报表） */
const FINANCE_HOME = '/admin/orders'
const FINANCE_ALLOWED = ['/admin/orders', '/admin/invoices', '/admin/finance']

/** 后台主布局
 *  - 管理员：Sidebar + Header + 完整页面
 *  - 销售：极简外壳，仅自助看板（其它路径一律跳回看板）
 */
export function AdminLayout() {
  return (
    <AdminRequireAuth>
      <AdminLayoutInner />
    </AdminRequireAuth>
  )
}

function AdminLayoutInner() {
  const user = useAdminAuthStore((s) => s.user)
  const location = useLocation()

  // 销售：只能看自助看板
  if (user?.role === 'sales') {
    if (location.pathname !== SALES_HOME) {
      return <Navigate to={SALES_HOME} replace />
    }
    return <SalesConsoleShell />
  }

  // 财务：正常 admin 外壳，但仅可访问订单管理 + 财务报表，越权一律跳回订单管理
  if (user?.role === 'finance') {
    const path = location.pathname
    const allowed = FINANCE_ALLOWED.some(
      (p) => path === p || path.startsWith(p + '/'),
    )
    if (!allowed) {
      return <Navigate to={FINANCE_HOME} replace />
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <AdminSidebar />
      <main className="relative flex-1 overflow-hidden bg-[#F6F5FC] dark:bg-background">
        <AdminHeader />
        <div className="h-full overflow-y-auto px-6 pt-[calc(theme(spacing.14)_+_24px)] pb-12 sm:px-8 md:px-10 lg:px-12">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function SalesConsoleShell() {
  const { user, logout } = useAdminAuthStore()
  const handleLogout = () => {
    logout()
    window.location.href = '/admin/login'
  }
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#F6F5FC] dark:bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-5">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="" className="size-8 shrink-0" draggable={false} />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-foreground">推量牛 · 销售看板</div>
            <div className="text-xs text-muted-foreground">{user?.nickname || user?.email}</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <RoleBadge role={user?.role} />
          <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5">
            <LogOut className="size-3.5" strokeWidth={2.25} />
            退出登录
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 md:px-10">
        <Outlet />
      </div>
    </div>
  )
}
