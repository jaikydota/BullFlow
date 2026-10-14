import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Coins, Crown, LogOut, MessageSquarePlus, Receipt, Settings } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/useAuth'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import { ROUTES } from '@/utils/constants'
import { cn, getInitials, isPlaceholderEmail, formatPhone } from '@/utils/helpers'

export type UserMenuPanelProps = {
  onSelect?: () => void
  onLogout: () => void | Promise<void>
}

/**
 * 用户菜单面板：左下角 Sidebar Popover 与右上角 Header Dropdown 共用。
 * 头像 + 昵称 + 标识 + 会员卡（套餐名 / 到期 / 剩余积分）；菜单：订阅 / 设置 / 退出。
 */
export function UserMenuPanel({ onSelect, onLogout }: UserMenuPanelProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const subscription = useSubscriptionStore((s) => s.subscription)

  const displayName = user?.nickname?.trim() || user?.email || ''
  const initials = displayName ? getInitials(displayName) : '?'

  // 标识：真实邮箱 > 手机号
  const identifier = (() => {
    if (user?.email && !isPlaceholderEmail(user.email)) return user.email
    if (user?.phone) return formatPhone(user.phone)
    return ''
  })()

  const planName = subscription?.plan_name ?? t('user.freePlan', '免费版')
  const remainingDays = subscription?.remaining_days ?? null
  const expiryUrgent = remainingDays !== null && remainingDays >= 0 && remainingDays <= 7
  const expiredAlready = remainingDays !== null && remainingDays < 0
  // 超过 30 年视为永久有效（10950 天）；remaining_days 为 null 也按永久处理（后端可能不返回到期日）
  const isPermanent = remainingDays === null || remainingDays > 30 * 365

  // 剩余积分 = 套餐临时积分剩余 + 永久增量包积分（两者都能用于消费）
  const tempRemaining = subscription?.points?.remaining
  const addonPoints = subscription?.addon_points ?? 0
  const pointsRemaining =
    tempRemaining != null ? tempRemaining + addonPoints : null

  const handleClick = () => onSelect?.()

  return (
    <div className="w-full">
      {/* 头部卡片 */}
      <div className="relative overflow-hidden border-b">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 to-pink-500/8" />
        <div className="relative space-y-3 p-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-12 ring-2 ring-primary/20">
              {user?.avatar && <AvatarImage src={user.avatar} alt={displayName} />}
              <AvatarFallback className="bg-gradient-to-br from-primary to-pink-500 font-bold text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {identifier || t('user.unbound', '未绑定')}
              </p>
            </div>
          </div>

          {/* 会员信息卡 */}
          <Link
            to={ROUTES.ACCOUNT_SUBSCRIPTION}
            onClick={handleClick}
            className="block rounded-lg border border-border bg-card/70 p-2.5 shadow-xs transition-colors hover:border-primary/40 hover:bg-card"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Crown className="size-3.5 shrink-0 text-amber-500" />
                <span className="truncate text-xs font-semibold text-foreground">
                  {planName}
                </span>
              </div>
              <span
                className={cn(
                  'shrink-0 text-[11px]',
                  expiredAlready
                    ? 'text-rose-500'
                    : expiryUrgent
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground',
                )}
              >
                {expiredAlready
                  ? t('user.expired', '已到期')
                  : isPermanent
                    ? t('user.permanent', '永久有效')
                    : t('user.daysLeft', '剩余 {{n}} 天', { n: remainingDays })}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Coins className="size-3" />
                {t('user.pointsRemaining', '剩余积分')}
              </span>
              <span
                className="font-medium text-foreground"
                title={
                  pointsRemaining != null
                    ? t('user.pointsBreakdown', '临时 {{temp}} + 永久 {{addon}}', {
                        temp: (tempRemaining ?? 0).toLocaleString(),
                        addon: addonPoints.toLocaleString(),
                      })
                    : undefined
                }
              >
                {pointsRemaining != null ? pointsRemaining.toLocaleString() : '—'}
              </span>
            </div>
          </Link>
        </div>
      </div>

      {/* 菜单项 */}
      <div className="p-1.5">
        <Link
          to={ROUTES.ACCOUNT_SUBSCRIPTION}
          onClick={handleClick}
          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground/85 transition-colors hover:bg-accent hover:text-foreground"
        >
          <Crown className="size-4 text-muted-foreground" />
          {t('menu.subscription')}
        </Link>
        <Link
          to={ROUTES.ACCOUNT_BILLING_DETAILS}
          onClick={handleClick}
          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground/85 transition-colors hover:bg-accent hover:text-foreground"
        >
          <Receipt className="size-4 text-muted-foreground" />
          {t('menu.billingDetails', '用量明细')}
        </Link>
        <Link
          to={ROUTES.SETTINGS}
          onClick={handleClick}
          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground/85 transition-colors hover:bg-accent hover:text-foreground"
        >
          <Settings className="size-4 text-muted-foreground" />
          {t('menu.settings')}
        </Link>
        <Link
          to={ROUTES.FEEDBACK}
          onClick={handleClick}
          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground/85 transition-colors hover:bg-accent hover:text-foreground"
        >
          <MessageSquarePlus className="size-4 text-muted-foreground" />
          {t('menu.feedback', '意见反馈')}
        </Link>
        <div className="my-1 h-px bg-border" />
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
          onClick={async () => {
            handleClick()
            await onLogout()
          }}
        >
          <LogOut className="size-4" />
          {t('auth.logout')}
        </button>
      </div>
    </div>
  )
}
