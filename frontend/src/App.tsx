import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { router } from '@/router'
import { trackEvent, EVENTS } from '@/utils/tracking'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { CaptchaHost } from '@/components/auth/CaptchaHost'
import '@/i18n'
import { SUPPORTED_LANGUAGES } from '@/utils/constants'

export function App() {
  const { i18n } = useTranslation()

  useEffect(() => {
    const meta =
      SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0]
    document.documentElement.lang = i18n.language
    document.documentElement.dir = meta.dir
  }, [i18n.language])

  // 全局页面访问埋点：监听 router，覆盖公开页（未登录）+ 受保护页，匿名也记录。
  // 放这里而非 AppLayout，是因为 AppLayout 只包裹登录后路由，会漏掉 login/register/pricing 等公开页。
  useEffect(() => {
    let lastPath = ''
    const handle = (pathname: string) => {
      if (pathname === lastPath) return
      lastPath = pathname
      trackEvent(EVENTS.PAGE_VIEW, { path: pathname })
      if (pathname === '/chat' || pathname.startsWith('/generation/')) {
        trackEvent(EVENTS.ENTER_CREATE_PAGE, { path: pathname })
      }
      if (pathname === '/pricing' || pathname.startsWith('/account/subscription')) {
        trackEvent(EVENTS.VIEW_PRICING, { path: pathname })
      }
    }
    handle(router.state.location.pathname)
    return router.subscribe((state) => handle(state.location.pathname))
  }, [])

  return (
    <ThemeProvider defaultTheme="light">
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        <RouterProvider router={router} />
        <CaptchaHost />
        <Toaster
          position="top-right"
          containerStyle={{ zIndex: 999999 }}
          toastOptions={{
            className: 'bg-card text-foreground border border-border shadow-md',
            style: {
              background: 'var(--card)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
            },
          }}
        />
      </div>
    </ThemeProvider>
  )
}
