import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { BarChart3, Home, Target, User, Zap } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ROUTES } from '@/utils/constants'

const navItems = [
  { icon: Home, label: 'menu.modules.home', href: ROUTES.DASHBOARD },
  { icon: Target, label: 'menu.modules.assets', href: ROUTES.KNOWLEDGE_COMPANIES },
  { icon: Zap, label: 'menu.modules.execute', href: ROUTES.GENERATION_ARTICLE },
  { icon: BarChart3, label: 'menu.modules.review', href: '/review/dashboard' },
  { icon: User, label: 'menu.modules.profile', href: ROUTES.SETTINGS },
]

const moduleMatchers: Record<string, (pathname: string) => boolean> = {
  [ROUTES.DASHBOARD]: (p) => p === '/' || p.startsWith('/dashboard') || p.startsWith('/chat'),
  [ROUTES.KNOWLEDGE_COMPANIES]: (p) =>
    p.startsWith('/knowledge') ||
    p.startsWith('/documents') ||
    p.startsWith('/media'),
  [ROUTES.GENERATION_ARTICLE]: (p) => p.startsWith('/generation') || p.startsWith('/tlf'),
  ['/review/dashboard']: (p) => p.startsWith('/review'),
  [ROUTES.SETTINGS]: (p) => p.startsWith('/settings'),
}

export function MobileNav() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t bg-card/95 px-1 pb-safe backdrop-blur shrink-0 md:hidden"
      aria-label={t('menu.mobileNav', '移动端导航')}
    >
      {navItems.map((item) => {
        const matcher = moduleMatchers[item.href]
        const isActive = matcher ? matcher(pathname) : pathname === item.href
        const Icon = item.icon
        return (
          <NavLink
            key={item.href}
            to={item.href}
            className="group relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 py-1.5"
          >
            {isActive && (
              <motion.span
                layoutId="mobile-nav-indicator"
                className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-b-full bg-primary"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <div
              className={cn(
                'flex size-9 items-center justify-center rounded-xl transition-all',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground group-hover:bg-accent',
              )}
            >
              <Icon className="size-[18px]" strokeWidth={2.2} />
            </div>
            <span
              className={cn(
                'text-[10.5px] font-medium leading-none tracking-tight transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {t(item.label)}
            </span>
          </NavLink>
        )
      })}
    </nav>
  )
}
