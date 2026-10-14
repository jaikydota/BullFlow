import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/components/layout/MobileNav'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopNotice } from '@/components/notice/TopNotice'
import { TrafficSecretWidget } from '@/components/trafficSecret/TrafficSecretWidget'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useNotificationRefresh } from '@/hooks/useNotificationRefresh'
import { useAuthStore } from '@/stores/authStore'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import { useUIStore } from '@/stores'
import { cn } from '@/lib/utils'

/** 这些路径需要全屏内容布局（无 main padding） */
const FULL_BLEED_PATHS: string[] = []

function isFullBleed(pathname: string) {
  return FULL_BLEED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export function AppLayout() {
  const isMobile = useIsMobile()
  const { pathname } = useLocation()
  const { sidebarOpen, setSidebarOpen } = useUIStore()
  const fullBleed = isFullBleed(pathname)

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const fetchSubscription = useSubscriptionStore((s) => s.fetch)
  useEffect(() => {
    if (isAuthenticated) {
      fetchSubscription()
    }
  }, [isAuthenticated, fetchSubscription])

  // 站内通知未读数：登录后拉一次 + 进入首页/创作中心时刷新，不再定时轮询
  useNotificationRefresh()

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-[#F6F5FC] dark:bg-background">
      {/* 顶部公告条：渲染在文档流最顶端，整页（含 Sidebar）一并被下推 */}
      <TopNotice />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* 桌面端：左侧双侧栏 */}
        {!isMobile && <Sidebar variant="desktop" />}

        {/* 右侧主区：Header 浮于内容之上，内容滚动透过毛玻璃 */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <main
            className={cn(
              'relative z-0 min-h-0 flex-1 overflow-auto pb-16 md:pb-0',
              fullBleed
                ? 'p-0'
                : 'px-6 pt-[calc(theme(spacing.14)_+_24px)] pb-10 sm:px-8 sm:pt-[calc(theme(spacing.14)_+_28px)] md:px-10 md:pt-[calc(theme(spacing.14)_+_32px)] lg:px-12',
            )}
          >
            <Suspense
              fallback={
                <div className="flex min-h-[40vh] items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-primary" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </main>

          {/* Header 绝对定位于 main 之上，毛玻璃透出内容 */}
          <Header
            showMobileMenu={isMobile}
            onOpenMobileSidebar={() => setSidebarOpen(true)}
          />

          {isMobile && <MobileNav />}
        </div>
      </div>

      {/* 移动端 Sheet 侧滑菜单 */}
      <Sheet open={isMobile && sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[280px] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>主菜单</SheetTitle>
          </SheetHeader>
          <Sidebar variant="drawer" onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* 流量密码：浮在页面右侧的可拖动入口，桌面端登录后显示 */}
      <TrafficSecretWidget />
    </div>
  )
}
