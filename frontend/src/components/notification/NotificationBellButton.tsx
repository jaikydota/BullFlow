import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useNotificationStore } from '@/stores/notificationStore'
import { cn } from '@/utils/helpers'

import { NotificationPanel } from './NotificationPanel'

function formatBadge(n: number): string {
  if (n <= 0) return ''
  if (n < 10) return String(n)
  if (n < 100) return '9+'
  return '99+'
}

export function NotificationBellButton() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const badge = formatBadge(unreadCount)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground menu-hover"
          aria-label={t('common.notifications', '通知')}
        >
          <Bell className="size-[18px]" strokeWidth={2.1} />
          {badge && (
            <span
              className={cn(
                'absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-card',
                badge.length > 1 ? 'h-[16px]' : 'size-[16px]',
              )}
            >
              {badge}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[340px] p-0">
        <NotificationPanel onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}
