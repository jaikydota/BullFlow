import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  ChevronDown,
  Crown,
  Gift,
  Globe,
  Menu,
  Search,
} from 'lucide-react'

import i18n from '@/i18n'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { NotificationBellButton } from '@/components/notification/NotificationBellButton'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { UserMenuPanel } from '@/components/layout/UserMenuPanel'
import { useAuth } from '@/hooks/useAuth'
import { useUIStore } from '@/stores'
import { useNotificationStore } from '@/stores/notificationStore'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import { ROUTES, SUPPORTED_LANGUAGES } from '@/utils/constants'
import { cn, getInitials, isPlaceholderEmail, formatPhone } from '@/utils/helpers'

export type HeaderProps = {
  onOpenMobileSidebar?: () => void
  showMobileMenu?: boolean
}

const searchPages: { title: string; href: string; group: string }[] = [
  { title: '仪表盘', href: ROUTES.DASHBOARD, group: '首页' },
  { title: '创作中心', href: ROUTES.CHAT, group: '首页' },
  { title: '企业', href: ROUTES.KNOWLEDGE_COMPANIES, group: '资产管理' },
  { title: '品牌', href: ROUTES.KNOWLEDGE_BRANDS, group: '资产管理' },
  { title: '产品', href: ROUTES.KNOWLEDGE_PRODUCTS, group: '资产管理' },
  { title: '客户', href: ROUTES.KNOWLEDGE_CUSTOMERS, group: '资产管理' },
  { title: '案例', href: ROUTES.KNOWLEDGE_CASES, group: '资产管理' },
  { title: '文档', href: ROUTES.DOCUMENTS, group: '资产管理' },
  { title: '图片库', href: ROUTES.MEDIA_IMAGES, group: '资产管理' },
  { title: '视频库', href: ROUTES.MEDIA_VIDEOS, group: '资产管理' },
  { title: '音频库', href: ROUTES.MEDIA_AUDIOS, group: '资产管理' },
  { title: '生成文章', href: ROUTES.GENERATION_ARTICLE, group: '创作分发' },
  { title: '生成图片', href: ROUTES.GENERATION_IMAGE, group: '创作分发' },
  { title: '生成视频', href: ROUTES.GENERATION_VIDEO, group: '创作分发' },
  { title: '数据仪表板', href: '/review/dashboard', group: '数据分析' },
  { title: '个人设置', href: ROUTES.SETTINGS, group: '系统' },
  { title: '邀请有礼', href: ROUTES.REFERRAL, group: '系统' },
]

export function Header({ onOpenMobileSidebar, showMobileMenu }: HeaderProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { setLanguage } = useUIStore()
  const [searchOpen, setSearchOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const subscription = useSubscriptionStore((s) => s.subscription)
  const isFreePlan = !subscription || subscription.plan_slug === 'free'

  // ⌘K / Ctrl+K 打开全局搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const handleLangChange = useCallback(
    (code: string) => {
      void i18n.changeLanguage(code)
      setLanguage(code)
    },
    [setLanguage],
  )

  const handleLogout = useCallback(async () => {
    await logout()
    navigate(ROUTES.LOGIN, { replace: true })
  }, [logout, navigate])

  const displayName = user?.nickname?.trim() || user?.email || ''
  const initials = displayName ? getInitials(displayName) : '?'
  // 触发按钮短标签：昵称 > 真实邮箱前缀 > 手机号 > 空（避免暴露 phone+xxx@matrix365.local 占位邮箱）
  const triggerLabel = (() => {
    if (user?.nickname?.trim()) return user.nickname.trim()
    if (user?.email && !isPlaceholderEmail(user.email)) return user.email.split('@')[0]
    if (user?.phone) return formatPhone(user.phone)
    return ''
  })()
  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)
  // 多语言适配完成前暂时隐藏顶部语言切换；后续改为 true 即开放
  const SHOW_LANGUAGE_SWITCHER = false
  // 操作手册外链（.env 中 VITE_MANUAL_URL 配置）；未配置时不渲染入口
  const manualUrl = import.meta.env.VITE_MANUAL_URL?.trim() || ''

  // 按分组聚合搜索结果
  const grouped = searchPages.reduce<Record<string, typeof searchPages>>((acc, p) => {
    ;(acc[p.group] ||= []).push(p)
    return acc
  }, {})

  return (
    <>
      <header className="absolute inset-x-0 top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-[#F6F5FC]/75 px-4 backdrop-blur-xl backdrop-saturate-150 dark:bg-background/75 md:px-6">
        {/* 左侧 */}
        <div className="flex items-center gap-2 md:gap-3">
          {showMobileMenu && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-ml-1 md:hidden"
              aria-label={t('menu.openSidebar')}
              onClick={onOpenMobileSidebar}
            >
              <Menu className="size-5" />
            </Button>
          )}
          {showMobileMenu && (
            <Link
              to={ROUTES.DASHBOARD}
              className="flex items-center gap-2 md:hidden"
            >
              <span className="flex size-7 items-center justify-center rounded-lg bg-card">
                <img
                  src="/logo.png"
                  alt=""
                  className="size-5 object-contain"
                  draggable={false}
                />
              </span>
              <span className="text-sm font-semibold tracking-tight">推量牛</span>
            </Link>
          )}
          {/* 桌面端全局搜索按钮 —— ⌘K 高对比度 */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="group hidden h-9 w-72 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card/80 px-3 text-left text-muted-foreground/80 shadow-xs transition-all hover:border-primary/30 hover:bg-card hover:text-foreground md:inline-flex"
          >
            <Search
              className="size-4 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-primary"
              strokeWidth={2.1}
            />
            <span className="text-sm font-normal">搜索功能、页面…</span>
            {/* ⌘K 快捷键样式 —— Linear / GitHub 同款双 kbd 风格 */}
            <span className="ml-auto inline-flex items-center gap-1">
              <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-background px-1 font-mono text-[11px] font-medium text-foreground/70 shadow-xs">
                ⌘
              </kbd>
              <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-background px-1 font-mono text-[11px] font-medium text-foreground/70 shadow-xs">
                K
              </kbd>
            </span>
          </button>
        </div>

        {/* 右侧 */}
        <div className="flex items-center gap-0.5 md:gap-1">
          {/* 主题切换 */}
          <ThemeToggle />

          {/* 通知 */}
          <NotificationBellButton />

          {/* 操作手册 —— 外链新开页 */}
          {manualUrl && (
            <a
              href={manualUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={t('common.userManual', '操作手册')}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground menu-hover"
            >
              <BookOpen className="size-[15px]" strokeWidth={2.2} />
              <span className="hidden sm:inline">{t('common.userManual', '操作手册')}</span>
            </a>
          )}

          {/* 语言切换：多语言适配完成前暂时隐藏（SHOW_LANGUAGE_SWITCHER 改 true 即开放） */}
          {SHOW_LANGUAGE_SWITCHER && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground menu-hover"
              >
                <Globe className="size-[15px]" strokeWidth={2.2} />
                <span className="hidden sm:inline">
                  {currentLang?.short ?? i18n.language.toUpperCase()}
                </span>
                <ChevronDown className="size-3 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {t('common.language', '语言')}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SUPPORTED_LANGUAGES.map((lang) => (
                <DropdownMenuItem
                  key={lang.code}
                  onClick={() => handleLangChange(lang.code)}
                  className={cn('text-xs', i18n.language === lang.code && 'bg-accent')}
                >
                  <span className="text-base leading-none">{lang.flag}</span>
                  <span className="flex-1 truncate">{lang.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          )}

          {/* 升级 CTA —— 仅 Free 套餐显示「升级」；已付费用户隐藏（订阅入口在头像菜单内） */}
          {user && isFreePlan && (
            <Button
              size="sm"
              onClick={() => navigate(ROUTES.PRICING)}
              className="ml-1 h-8 cursor-pointer gap-1.5 bg-gradient-to-r from-primary to-fuchsia-500 px-3 text-xs font-semibold text-white shadow-soft hover:opacity-90"
            >
              <Crown className="size-3.5" strokeWidth={2.4} />
              <span className="hidden sm:inline">{t('menu.upgradePlan')}</span>
            </Button>
          )}

          {/* 邀请有礼 —— 销售账号隐藏（销售走自己的引流体系，无增量包奖励） */}
          {user && (user.role as string) !== 'sales' && (
            <Button
              size="sm"
              onClick={() => navigate(ROUTES.REFERRAL)}
              className="ml-1 h-8 cursor-pointer gap-1.5 bg-gradient-to-r from-amber-400 to-orange-500 px-3 text-xs font-semibold text-white shadow-soft hover:opacity-90"
            >
              <Gift className="size-3.5" strokeWidth={2.4} />
              <span className="hidden sm:inline">{t('menu.referral', '邀请有礼')}</span>
            </Button>
          )}

          {/* 用户菜单 —— 与左下角 Sidebar Popover 共用 UserMenuPanel，保证样式 / 选项一致 */}
          <Popover
            open={userMenuOpen}
            onOpenChange={(open) => {
              setUserMenuOpen(open)
              // 点击头像打开账户菜单时刷新一次未读数（替代定时轮询）
              if (open) useNotificationStore.getState().refreshCount()
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="ml-1 h-9 cursor-pointer gap-2 pl-1.5 pr-2.5 menu-hover"
              >
                <Avatar className="size-7 ring-2 ring-background">
                  {user?.avatar && <AvatarImage src={user.avatar} alt={displayName} />}
                  <AvatarFallback className="bg-gradient-to-br from-primary to-pink-500 text-[11px] font-bold text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium text-foreground/90 sm:inline">
                  {triggerLabel}
                </span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-0">
              <UserMenuPanel
                onSelect={() => setUserMenuOpen(false)}
                onLogout={handleLogout}
              />
            </PopoverContent>
          </Popover>
        </div>
      </header>

      {/* 全局搜索（⌘K） */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="搜索功能、页面…" />
        <CommandList>
          <CommandEmpty>无匹配结果</CommandEmpty>
          {Object.entries(grouped).map(([group, pages]) => (
            <CommandGroup key={group} heading={group}>
              {pages.map((page) => (
                <CommandItem
                  key={page.href}
                  value={`${group} ${page.title}`}
                  onSelect={() => {
                    setSearchOpen(false)
                    navigate(page.href)
                  }}
                >
                  {page.title}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}
