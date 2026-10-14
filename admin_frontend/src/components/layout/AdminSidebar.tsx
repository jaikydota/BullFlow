import * as React from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  BadgeDollarSign,
  BarChart3,
  Bell,
  ChevronsLeft,
  ChevronsRight,
  CreditCard,
  FileText,
  Filter,
  type LucideIcon,
  Key,
  Landmark,
  LayoutDashboard,
  ListTree,
  LogOut,
  Megaphone,
  MessageSquare,
  Package,
  Receipt,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAdminAuthStore } from '@/stores/adminAuthStore'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
}

type NavGroup = {
  title: string
  items: NavItem[]
}

/** 6 分组 / 23 个菜单项（不含登录） */
const NAV_GROUPS: NavGroup[] = [
  {
    title: '数据概览',
    items: [
      { to: '/admin/dashboard', label: '仪表盘', icon: LayoutDashboard },
      { to: '/admin/analytics', label: '数据分析', icon: BarChart3 },
      { to: '/admin/finance', label: '财务报表', icon: Receipt },
    ],
  },
  {
    title: '数据埋点',
    items: [
      { to: '/admin/tracking/overview', label: '数据概览', icon: Activity },
      { to: '/admin/tracking/funnel', label: '转化漏斗', icon: Filter },
      { to: '/admin/tracking/creation', label: '创作分析', icon: Sparkles },
      { to: '/admin/tracking/payment', label: '支付分析', icon: CreditCard },
      { to: '/admin/tracking/events', label: '事件明细', icon: ListTree },
    ],
  },
  {
    title: '用户与权限',
    items: [
      { to: '/admin/users', label: '用户管理', icon: Users },
      { to: '/admin/roles', label: '角色权限', icon: ShieldCheck },
      { to: '/admin/sales', label: '销售管理', icon: BadgeDollarSign },
      { to: '/admin/finance-team', label: '财务管理', icon: Landmark },
    ],
  },
  {
    title: '计费与订单',
    items: [
      { to: '/admin/plans', label: '套餐与加包', icon: Package },
      { to: '/admin/orders', label: '订单管理', icon: FileText },
      { to: '/admin/invoices', label: '发票管理', icon: ReceiptText },
      { to: '/admin/billing', label: '收费配置', icon: CreditCard },
    ],
  },
  {
    title: '平台运营',
    items: [
      { to: '/admin/settings', label: '平台设置', icon: Settings },
      { to: '/admin/broadcasts', label: '消息推送', icon: Megaphone },
      { to: '/admin/notifications', label: '通知通道', icon: Bell },
      { to: '/admin/feedback', label: '用户反馈', icon: MessageSquare },
      { to: '/admin/skills', label: 'Skill 池', icon: Sparkles },
    ],
  },
  {
    title: '资源运维',
    items: [
      { to: '/admin/traffic-password', label: '流量密码', icon: Key },
      { to: '/admin/logs', label: '操作日志', icon: ScrollText },
    ],
  },
]

/** 财务角色仅可见：订单管理 + 财务报表 */
const FINANCE_VISIBLE = new Set(['/admin/orders', '/admin/invoices', '/admin/finance'])

/** 按当前登录用户角色过滤侧边栏分组 */
function filterGroupsByRole(role: string | undefined): NavGroup[] {
  if (role === 'finance') {
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((it) => FINANCE_VISIBLE.has(it.to)),
    })).filter((g) => g.items.length > 0)
  }
  // admin / super_admin 等看全部
  return NAV_GROUPS
}

const COLLAPSE_KEY = 'matrix365_admin_sidebar_collapsed'

/** C 端前台站点 URL（双域部署时配 VITE_FRONTEND_URL；默认 /） */
const FRONTEND_URL =
  ((import.meta as { env?: Record<string, string> }).env?.VITE_FRONTEND_URL ?? '/').trim() || '/'

export function AdminSidebar() {
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const location = useLocation()
  const { logout } = useAdminAuthStore()
  const role = useAdminAuthStore((s) => s.user?.role)
  const navGroups = React.useMemo(() => filterGroupsByRole(role), [role])

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const handleLogout = () => {
    logout()
    window.location.href = '/admin/login'
  }

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'relative flex h-full shrink-0 flex-col border-r border-border bg-card transition-[width] duration-300',
          collapsed ? 'w-14' : 'w-60',
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            'flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-3.5',
            collapsed && 'justify-center px-2',
          )}
        >
          <Link
            to="/admin/dashboard"
            className="flex items-center gap-2.5"
            aria-label="推量牛 · 管理后台"
          >
            <img src="/logo.png" alt="" className="size-10 shrink-0" draggable={false} />
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-lg font-semibold leading-tight text-foreground">
                  推量牛
                </div>
                <div className="text-xs font-medium leading-tight text-muted-foreground">
                  管理后台
                </div>
              </div>
            )}
          </Link>
        </div>

        {/* Nav body */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {navGroups.map((group) => (
            <div key={group.title} className="mb-4 last:mb-0">
              {!collapsed && (
                <div className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {group.title}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const active =
                    location.pathname === item.to ||
                    location.pathname.startsWith(item.to + '/')
                  return (
                    <li key={item.to}>
                      <SidebarItem
                        to={item.to}
                        label={item.label}
                        icon={Icon}
                        active={active}
                        collapsed={collapsed}
                      />
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-border p-2">
          <SidebarItem
            to={FRONTEND_URL}
            label="返回前台"
            icon={ArrowLeft}
            collapsed={collapsed}
            external
          />
          <button
            type="button"
            onClick={handleLogout}
            className={cn(
              'menu-hover mt-0.5 flex w-full cursor-pointer items-center rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
              collapsed ? 'h-9 justify-center px-0' : 'h-9 gap-2.5 px-2.5',
            )}
            title={collapsed ? '退出登录' : undefined}
          >
            <LogOut className="size-4 shrink-0" strokeWidth={2.25} />
            {!collapsed && <span>退出登录</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={toggle}
          className="absolute -right-3 top-16 z-30 flex size-6 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-colors hover:bg-primary/5 hover:text-primary"
          aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
        >
          {collapsed ? (
            <ChevronsRight className="size-3.5" strokeWidth={2.25} />
          ) : (
            <ChevronsLeft className="size-3.5" strokeWidth={2.25} />
          )}
        </button>
      </aside>
    </TooltipProvider>
  )
}

function SidebarItem({
  to,
  label,
  icon: Icon,
  active,
  collapsed,
  external,
}: {
  to: string
  label: string
  icon: LucideIcon
  active?: boolean
  collapsed: boolean
  external?: boolean
}) {
  const baseClass = cn(
    'group flex cursor-pointer items-center rounded-md text-sm font-medium transition-colors',
    collapsed ? 'h-9 justify-center px-0' : 'h-9 gap-2.5 px-2.5',
    active
      ? 'bg-primary/10 text-primary'
      : 'menu-hover text-muted-foreground hover:text-foreground',
  )

  const inner = (
    <>
      {active && !collapsed && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
      )}
      <Icon className="size-4 shrink-0" strokeWidth={2.25} />
      {!collapsed && <span className="truncate">{label}</span>}
    </>
  )

  const link = external ? (
    <a href={to} className={cn('relative', baseClass)}>
      {inner}
    </a>
  ) : (
    <NavLink to={to} className={cn('relative', baseClass)}>
      {inner}
    </NavLink>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    )
  }
  return link
}

