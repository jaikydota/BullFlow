import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import type { NotificationItem } from '@/api/notification'
import { useNotificationStore } from '@/stores/notificationStore'
import { formatRelativeTime } from '@/utils/format'
import { cn } from '@/utils/helpers'
import { TONE_CLASSES, getTypeMeta } from './toneClasses'

type Props = {
  item: NotificationItem
  onAfterClick?: () => void
  showDelete?: boolean
  /** 自定义删除（如全量页用本地 state 控制时）；未传则走 store */
  onRemove?: (id: string) => void
  /** 如传入，点击行后调用此函数打开详情弹框，而不是直接导航 */
  onOpenDetail?: (item: NotificationItem) => void
}

export function NotificationRow({
  item,
  onAfterClick,
  showDelete = false,
  onRemove,
  onOpenDetail,
}: Props) {
  const navigate = useNavigate()
  const markRead = useNotificationStore((s) => s.markRead)
  const remove = useNotificationStore((s) => s.remove)

  const { icon: Icon, tone } = getTypeMeta(item.type)
  const toneCls = TONE_CLASSES[tone]
  const unread = !item.readAt

  const handleClick = () => {
    if (unread) void markRead(item.id)
    // 若调用方提供了 detail 回调（如通知中心列表页），优先弹详情
    if (onOpenDetail) {
      onOpenDetail(item)
      onAfterClick?.()
      return
    }
    if (item.linkUrl) {
      const url = item.linkUrl.trim()
      if (/^https?:\/\//i.test(url)) {
        window.open(url, '_blank', 'noopener,noreferrer')
      } else if (url.startsWith('/')) {
        navigate(url)
      }
    }
    onAfterClick?.()
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onRemove) onRemove(item.id)
    else void remove(item.id)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
      className={cn(
        'group relative flex cursor-pointer gap-3 px-3 py-3 transition-colors',
        'hover:bg-muted/50',
        unread && 'bg-primary/[0.04]',
      )}
    >
      {/* 图标圆 */}
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          toneCls.bg,
        )}
      >
        <Icon className={cn('size-4', toneCls.text)} strokeWidth={2.2} />
      </div>

      {/* 内容 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="line-clamp-1 flex-1 text-[13px] font-semibold leading-tight text-foreground">
            {item.title}
          </p>
          {unread && (
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="未读" />
          )}
        </div>
        {item.message && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
            {item.message}
          </p>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground/70">
          {formatRelativeTime(item.createdAt)}
        </p>
      </div>

      {/* 删除按钮（全量页用） */}
      {showDelete && (
        <button
          type="button"
          onClick={handleDelete}
          aria-label="删除"
          className="absolute right-2 top-2 flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  )
}
