import { useEffect, useState, useMemo } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  Gauge,
  History,
  Image as ImageIcon,
  Layers,
  Library,
  LineChart,
  Link2,
  Megaphone,
  Mic,
  Package,
  PenLine,
  Search,
  Send,
  Tag,
  UserCircle,
  Users,
  Video,
  Wand2,
} from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAuth } from '@/hooks/useAuth'
import { useNotificationStore } from '@/stores/notificationStore'
import { ROUTES } from '@/utils/constants'
import { cn, getInitials, isPlaceholderEmail, formatPhone } from '@/utils/helpers'
import { UserMenuPanel } from '@/components/layout/UserMenuPanel'

type IconType = typeof Gauge

type SidebarItem = {
  title: string
  href: string
  icon: IconType
  /** 仅超级管理员可见（用于内部测试入口） */
  requireSuperAdmin?: boolean
}

type SidebarGroup = {
  title: string
  icon: IconType
  items: SidebarItem[]
}

type SidebarModule = {
  id: string
  label: string
  icon: IconType
  description: string
  /** 模块主色调（用于图标盒渐变） */
  accent: 'primary' | 'emerald' | 'rose' | 'sky'
  groups?: SidebarGroup[]
  items?: SidebarItem[]
}

const modules: SidebarModule[] = [
  {
    id: 'home',
    label: 'menu.modules.home',
    icon: Gauge,
    description: 'menu.modules.homeDesc',
    accent: 'primary',
    items: [
      { title: 'menu.chat', href: ROUTES.CHAT, icon: Wand2 },
      { title: 'menu.dashboard', href: ROUTES.DASHBOARD, icon: BarChart3 },
    ],
  },
  {
    id: 'assets',
    label: 'menu.modules.assets',
    icon: Library,
    description: 'menu.modules.assetsDesc',
    accent: 'emerald',
    groups: [
      {
        title: 'menu.companyInfo',
        icon: Building2,
        items: [
          { title: 'menu.companies', href: ROUTES.KNOWLEDGE_COMPANIES, icon: Building2 },
          { title: 'menu.brands', href: ROUTES.KNOWLEDGE_BRANDS, icon: Tag },
          { title: 'menu.products', href: ROUTES.KNOWLEDGE_PRODUCTS, icon: Package },
          { title: 'menu.customers', href: ROUTES.KNOWLEDGE_CUSTOMERS, icon: UserCircle },
          { title: 'menu.cases', href: ROUTES.KNOWLEDGE_CASES, icon: Briefcase },
        ],
      },
      {
        title: 'menu.media',
        icon: Layers,
        items: [
          { title: 'menu.documents', href: ROUTES.DOCUMENTS, icon: FileText },
          { title: 'menu.images', href: ROUTES.MEDIA_IMAGES, icon: ImageIcon },
          { title: 'menu.videos', href: ROUTES.MEDIA_VIDEOS, icon: Video },
          { title: 'menu.audios', href: ROUTES.MEDIA_AUDIOS, icon: Mic },
        ],
      },
      {
        title: 'menu.knowledgeSearch',
        icon: Search,
        items: [
          { title: 'menu.unifiedSearch', href: ROUTES.KNOWLEDGE_FINDER, icon: BookOpen },
          { title: 'menu.search', href: ROUTES.KNOWLEDGE_SEARCH, icon: Search, requireSuperAdmin: true },
        ],
      },
    ],
  },
  {
    id: 'execute',
    label: 'menu.modules.execute',
    icon: Megaphone,
    description: 'menu.modules.executeDesc',
    accent: 'rose',
    groups: [
      {
        title: 'menu.contentCreation',
        icon: Wand2,
        items: [
          { title: 'menu.article', href: ROUTES.GENERATION_ARTICLE, icon: PenLine },
          { title: 'menu.imageGen', href: ROUTES.GENERATION_IMAGE, icon: ImageIcon },
          { title: 'menu.videoGen', href: ROUTES.GENERATION_VIDEO, icon: Video },
          { title: 'menu.autoSchedule', href: ROUTES.GENERATION_AUTO_SCHEDULE, icon: CalendarClock },
          { title: 'menu.contentLibrary', href: ROUTES.GENERATION_LIBRARY, icon: History },
        ],
      },
      {
        title: 'menu.tlfDistribution',
        icon: Send,
        items: [
          { title: 'menu.tlfAccounts', href: '/tlf/accounts', icon: Link2 },
          { title: 'menu.tlfPublish', href: '/tlf/publish', icon: Send },
          { title: 'menu.tlfTasks', href: '/tlf/tasks', icon: BarChart3 },
        ],
      },
    ],
  },
  {
    id: 'review',
    label: 'menu.modules.review',
    icon: LineChart,
    description: 'menu.modules.reviewDesc',
    accent: 'sky',
    items: [
      { title: 'menu.reviewDashboard', href: '/review/dashboard', icon: BarChart3 },
      { title: 'menu.reviewContent', href: '/review/content', icon: LineChart },
      { title: 'menu.reviewChannels', href: '/review/channels', icon: Users },
    ],
  },
]

const accentGradient: Record<SidebarModule['accent'], string> = {
  primary: 'from-primary to-pink-500',
  emerald: 'from-emerald-500 to-teal-500',
  rose: 'from-rose-500 to-amber-500',
  sky: 'from-sky-500 to-violet-500',
}

const accentTint: Record<SidebarModule['accent'], string> = {
  primary: 'bg-primary/10 text-primary',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
}

const accentRing: Record<SidebarModule['accent'], string> = {
  primary: 'shadow-primary/25',
  emerald: 'shadow-emerald-500/25',
  rose: 'shadow-rose-500/25',
  sky: 'shadow-sky-500/25',
}

export type SidebarProps = {
  variant?: 'desktop' | 'drawer'
  onNavigate?: () => void
}

function getModuleIdForPath(pathname: string): string {
  if (pathname === '/' || pathname.startsWith('/dashboard')) return 'home'
  if (pathname.startsWith('/chat')) return 'home'
  if (
    pathname.startsWith('/knowledge') ||
    pathname.startsWith('/documents') ||
    pathname.startsWith('/media') ||
    pathname.startsWith('/materials')
  )
    return 'assets'
  if (
    pathname.startsWith('/generation') ||
    pathname.startsWith('/distribution') ||
    pathname.startsWith('/tlf')
  )
    return 'execute'
  if (pathname.startsWith('/review')) return 'review'
  return 'home'
}

/** 把模块下所有可点击的二级项扁平成一个数组（带分组归属信息），用于折叠态 icon-only 显示 */
function flattenItems(module: SidebarModule | undefined): SidebarItem[] {
  if (!module) return []
  if (module.items) return module.items
  return module.groups?.flatMap((g) => g.items) ?? []
}

export function Sidebar({ variant = 'desktop', onNavigate }: SidebarProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const { user, logout, isSuperAdmin } = useAuth()

  /** 过滤掉 requireSuperAdmin 但当前非超管的菜单项 */
  const filterItems = (items: SidebarItem[]): SidebarItem[] =>
    items.filter((it) => !it.requireSuperAdmin || isSuperAdmin)

  const initialModule = useMemo(() => getModuleIdForPath(location.pathname), [location.pathname])
  const [activeModule, setActiveModule] = useState<string>(initialModule)
  const [showPanel, setShowPanel] = useState(true)
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false)

  // 路由变化时同步 activeModule（点击 Logo 跳转或浏览器前进后退也能跟随）
  useEffect(() => {
    const id = getModuleIdForPath(location.pathname)
    setActiveModule(id)
  }, [location.pathname])

  const displayName = (() => {
    if (user?.nickname?.trim()) return user.nickname.trim()
    if (user?.email && !isPlaceholderEmail(user.email)) return user.email
    if (user?.phone) return formatPhone(user.phone)
    return ''
  })()
  const initials = displayName ? getInitials(displayName) : '?'
  const currentModule = modules.find((m) => m.id === activeModule)
  const collapsedItems = filterItems(flattenItems(currentModule))

  const handleNav = () => onNavigate?.()

  const isActiveItem = (href: string) =>
    location.pathname === href ||
    (href !== '/' && location.pathname.startsWith(href + '/')) ||
    (href !== '/' && location.pathname === href)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full shrink-0 relative">
        {/* 左侧 icon 列 —— L1 最浅（#FFFFFF）/ 暗色还原最亮 */}
        <div className="relative z-10 flex h-full w-[72px] flex-col items-center bg-[#FFFFFF] dark:bg-[oklch(0.27_0.008_285)]">
          {/* Logo 行 —— 更大、更舒展的品牌区 */}
          <div className="relative flex h-20 w-full shrink-0 items-center justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={ROUTES.DASHBOARD}
                  onClick={() => {
                    setActiveModule('home')
                    setShowPanel(true)
                    handleNav()
                  }}
                  className="group relative flex size-14 cursor-pointer items-center justify-center transition-transform hover:scale-[1.06]"
                  aria-label="推量牛"
                >
                  <img
                    src="/logo.png"
                    alt="推量牛"
                    className="size-14 object-contain transition-transform group-hover:scale-110"
                    draggable={false}
                  />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">推量牛</TooltipContent>
            </Tooltip>
            {/* Logo 行底部分割线 —— 两侧留 padding，极淡 */}
            <div className="absolute inset-x-3 bottom-0 h-px bg-[oklch(0.96_0_0)] dark:bg-[oklch(0.32_0.008_285)]" aria-hidden />
          </div>

          {/* 模块图标 */}
          <div className="mt-3 flex w-full flex-col items-center gap-0.5 px-2">
            {modules.map((module) => {
              const Icon = module.icon
              const isActive = activeModule === module.id
              return (
                <Tooltip key={module.id} delayDuration={300}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModule(module.id)
                        setShowPanel(true)
                        // 点击一级模块按钮时刷新一次未读数（替代定时轮询）
                        useNotificationStore.getState().refreshCount()
                      }}
                      className={cn(
                        'group relative flex w-14 cursor-pointer flex-col items-center gap-0.5 rounded-lg px-1 py-2',
                        isActive
                          ? 'text-foreground'
                          : 'text-muted-foreground menu-hover',
                      )}
                    >
                      {/* 激活态左侧指示条 —— 更短更精致 */}
                      {isActive && (
                        <motion.span
                          layoutId="sidebar-active-indicator"
                          className={cn(
                            'absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b',
                            accentGradient[module.accent],
                          )}
                          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        />
                      )}
                      <div
                        className={cn(
                          'flex size-9 items-center justify-center rounded-md transition-all',
                          isActive
                            ? cn(
                                'bg-gradient-to-br text-white shadow-soft',
                                accentGradient[module.accent],
                                accentRing[module.accent],
                              )
                            : 'bg-transparent',
                        )}
                      >
                        <Icon className="size-[18px]" strokeWidth={2.1} />
                      </div>
                      <span
                        className={cn(
                          'text-[10px] font-medium leading-tight tracking-tight',
                          isActive ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {t(module.label)}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[220px]">
                    <p className="mb-1 font-medium">{t(module.label)}</p>
                    <p className="text-xs leading-relaxed opacity-80">{t(module.description)}</p>
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>

          <div className="flex-1" />

          {/* 用户菜单 Popover */}
          <Popover
            open={accountPopoverOpen}
            onOpenChange={(open) => {
              setAccountPopoverOpen(open)
              // 点击头像打开账户菜单时刷新一次未读数（替代定时轮询）
              if (open) useNotificationStore.getState().refreshCount()
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="账户"
                className="group mb-3 flex w-14 cursor-pointer items-center justify-center rounded-lg px-1 py-2 menu-hover"
              >
                <div className="relative">
                  <Avatar className="size-9 ring-2 ring-background transition-shadow group-hover:ring-primary/20">
                    {user?.avatar && <AvatarImage src={user.avatar} alt={displayName} />}
                    <AvatarFallback className="bg-gradient-to-br from-primary to-pink-500 text-[11px] font-bold text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-sidebar bg-emerald-500" />
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="end" className="w-64 p-0">
              <UserMenuPanel
                onSelect={() => {
                  setAccountPopoverOpen(false)
                  handleNav()
                }}
                onLogout={logout}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* 右侧模块菜单面板 —— 展开 / 折叠 icon 列 二态切换 */}
        <AnimatePresence initial={false} mode="wait">
          {showPanel && currentModule ? (
            <motion.div
              key="sidebar-panel-expanded"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 224, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="relative h-full overflow-hidden bg-[#FCFBFE] dark:bg-card"
            >
              <div className="flex h-full w-56 flex-col">
                {/* 模块标题 —— h-14 对齐内容页 Header */}
                <div className="relative flex h-14 shrink-0 items-center gap-2.5 px-4">
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-md',
                      accentTint[currentModule.accent],
                    )}
                  >
                    <currentModule.icon className="size-4" strokeWidth={2.1} />
                  </span>
                  <h2 className="text-[13px] font-semibold tracking-tight text-foreground">
                    {t(currentModule.label)}
                  </h2>
                  {/* 标题底部分割线 —— 两侧留 padding，与 L1 / 内容页 Header 对齐 */}
                  <div className="absolute inset-x-4 bottom-0 h-px bg-[oklch(0.95_0_0)] dark:bg-[oklch(0.3_0.008_285)]" aria-hidden />
                </div>

                {/* 菜单列表 */}
                <ScrollArea className="flex-1">
                  <div className="space-y-0.5 px-2.5 pb-3 pt-3">
                    {/* 顶级 items（无分组） */}
                    {filterItems(currentModule.items ?? []).map((item) => {
                      const Icon = item.icon
                      const active = isActiveItem(item.href)
                      return (
                        <NavLink
                          key={item.href}
                          to={item.href}
                          onClick={handleNav}
                          className={cn(
                            'group relative flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm',
                            active
                              ? 'bg-primary/10 font-medium text-primary'
                              : 'text-foreground/75 menu-hover',
                          )}
                        >
                          {active && (
                            <motion.span
                              layoutId="sidebar-item-active"
                              className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-primary"
                              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                            />
                          )}
                          <Icon
                            className={cn(
                              'size-4 shrink-0 transition-colors',
                              active
                                ? 'text-primary'
                                : 'text-muted-foreground group-hover:text-foreground',
                            )}
                            strokeWidth={2.1}
                          />
                          <span className="truncate">{t(item.title)}</span>
                        </NavLink>
                      )
                    })}

                    {/* 子分组 —— 静态小标题 + 永久展开，无折叠箭头 */}
                    {currentModule.groups?.map((group, gi) => (
                      <div key={group.title} className={cn(gi > 0 && 'mt-3')}>
                        {/* 小分组标题 —— 左移与 L2 title 底分割线左侧对齐（pl-1.5 + 容器 px-2.5 = 16px from panel） */}
                        <div className="pb-1 pl-1.5 pr-3 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                          {t(group.title)}
                        </div>
                        {/* 分组内菜单项 */}
                        <div className="space-y-0.5">
                          {filterItems(group.items).map((item) => {
                            const Icon = item.icon
                            const active = isActiveItem(item.href)
                            return (
                              <NavLink
                                key={item.href}
                                to={item.href}
                                onClick={handleNav}
                                className={cn(
                                  'group relative flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px]',
                                  active
                                    ? 'bg-primary/10 font-medium text-primary'
                                    : 'text-foreground/75 menu-hover',
                                )}
                              >
                                {active && (
                                  <motion.span
                                    layoutId="sidebar-item-active"
                                    className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-primary"
                                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                                  />
                                )}
                                <Icon
                                  className={cn(
                                    'size-4 shrink-0 transition-colors',
                                    active
                                      ? 'text-primary'
                                      : 'text-muted-foreground group-hover:text-foreground',
                                  )}
                                  strokeWidth={2.1}
                                />
                                <span className="truncate">{t(item.title)}</span>
                              </NavLink>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </motion.div>
          ) : showPanel === false && currentModule ? (
            // 折叠态：icon-only 二级菜单
            <motion.div
              key="sidebar-panel-collapsed"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 56, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="relative flex h-full flex-col overflow-hidden bg-[#FCFBFE] dark:bg-card"
            >
              {/* 顶部 h-14 —— 显示当前模块图标 + 底部分割线 */}
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-md',
                    accentTint[currentModule.accent],
                  )}
                >
                  <currentModule.icon className="size-4" strokeWidth={2.1} />
                </span>
                <div className="absolute inset-x-3 bottom-0 h-px bg-[oklch(0.95_0_0)] dark:bg-[oklch(0.3_0.008_285)]" aria-hidden />
              </div>
              <ScrollArea className="flex-1">
                <div className="flex w-14 flex-col items-center gap-1 px-1.5 pb-3.5 pt-2">
                  {collapsedItems.map((item) => {
                    const Icon = item.icon
                    const active = isActiveItem(item.href)
                    return (
                      <Tooltip key={item.href} delayDuration={250}>
                        <TooltipTrigger asChild>
                          <NavLink
                            to={item.href}
                            onClick={handleNav}
                            className={cn(
                              'group relative flex size-9 cursor-pointer items-center justify-center rounded-lg',
                              active
                                ? 'bg-primary/12 text-primary shadow-xs'
                                : 'text-muted-foreground menu-hover',
                            )}
                          >
                            {active && (
                              <motion.span
                                layoutId="sidebar-item-active"
                                className="absolute -left-1.5 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
                                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                              />
                            )}
                            <Icon className="size-[17px]" strokeWidth={2.1} />
                          </NavLink>
                        </TooltipTrigger>
                        <TooltipContent side="right">{t(item.title)}</TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              </ScrollArea>
            </motion.div>
          ) : null}
        </AnimatePresence>


        {/* L1 与 L2 之间的全高细分割线 —— 极淡 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-[72px] z-30 w-px bg-[color-mix(in_oklab,#e7e5e4_30%,transparent)] dark:bg-[oklch(0.3_0.008_285)]"
        />

        {/* L2 与内容区之间的全高细分割线 —— 极淡，且 z-40 压在 Header 之上 */}
        {currentModule && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-40 w-px bg-[color-mix(in_oklab,#e7e5e4_30%,transparent)] transition-[left] duration-200 dark:bg-[oklch(0.3_0.008_285)]"
            style={{ left: showPanel ? 'calc(72px + 224px)' : 'calc(72px + 56px)' }}
          />
        )}

        {/* 折叠/展开按钮 */}
        {variant === 'desktop' && currentModule && (
          <button
            type="button"
            onClick={() => setShowPanel(!showPanel)}
            className={cn(
              'group absolute top-20 z-50 flex h-7 w-[18px] -translate-x-1/2 cursor-pointer items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground shadow-soft transition-all hover:border-primary/40 hover:text-primary hover:shadow-pop',
            )}
            style={{ left: showPanel ? 'calc(72px + 224px)' : 'calc(72px + 56px)' }}
            aria-label={showPanel ? '收起菜单' : '展开菜单'}
          >
            {showPanel ? (
              <ChevronLeft className="size-3" strokeWidth={2.4} />
            ) : (
              <ChevronRight className="size-3" strokeWidth={2.4} />
            )}
          </button>
        )}
      </div>
    </TooltipProvider>
  )
}
