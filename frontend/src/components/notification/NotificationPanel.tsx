import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell, Loader2 } from 'lucide-react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { useNotificationStore } from '@/stores/notificationStore'
import { ROUTES } from '@/utils/constants'

import { NotificationRow } from './NotificationRow'

type Props = {
  onClose: () => void
}

export function NotificationPanel({ onClose }: Props) {
  const { t } = useTranslation()
  const items = useNotificationStore((s) => s.items)
  const loading = useNotificationStore((s) => s.loading)
  const initialLoaded = useNotificationStore((s) => s.initialLoaded)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const loadPanelList = useNotificationStore((s) => s.loadPanelList)
  const markAllRead = useNotificationStore((s) => s.markAllRead)

  // 面板打开时（组件首次挂载）拉一次最新列表
  useEffect(() => {
    void loadPanelList()
  }, [loadPanelList])

  const hasUnread = unreadCount > 0

  return (
    <div className="flex w-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-5">
        <p className="text-sm font-semibold text-foreground">
          {t('notification.title', '消息通知')}
        </p>
        {hasUnread && (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="-mr-1.5 cursor-pointer rounded-md px-2 py-1.5 text-xs text-muted-foreground/60 transition-colors hover:bg-muted hover:text-primary"
          >
            {t('notification.markAllRead', '全部已读')}
          </button>
        )}
      </div>

      {/* List —— 默认高度撑到 320px，避免空/少消息时显得矮胖；列表多时最高 480px 内滚动 */}
      <ScrollArea className="h-[320px] max-h-[480px]">
        {!initialLoaded && loading ? (
          <div className="flex h-full min-h-[280px] items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            {t('common.loading', '加载中…')}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Bell className="size-6 opacity-50" />
            </div>
            <span>{t('notification.empty', '暂无通知')}</span>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {items.map((item) => (
              <NotificationRow key={item.id} item={item} onAfterClick={onClose} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-border p-2">
        <Link
          to={ROUTES.ACCOUNT_NOTIFICATIONS}
          onClick={onClose}
          className="flex w-full cursor-pointer items-center justify-center rounded-md py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {t('notification.viewAll', '查看全部通知')}
        </Link>
      </div>
    </div>
  )
}
