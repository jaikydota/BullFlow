import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell, ChevronLeft, ChevronRight, ExternalLink, Loader2 } from 'lucide-react'

import MarkDown2 from '@/components/markdown2'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageContainer, PageHeader } from '@/components/shared'
import { NotificationRow } from '@/components/notification/NotificationRow'
import { getTypeMeta, TONE_CLASSES } from '@/components/notification/toneClasses'
import { useTheme } from '@/components/theme/ThemeProvider'
import { notificationApi, type NotificationItem } from '@/api/notification'
import { useNotificationStore } from '@/stores/notificationStore'
import { usePagination } from '@/hooks/usePagination'
import { formatRelativeTime } from '@/utils/format'
import { cn } from '@/utils/helpers'

const TYPE_TABS: { key: string; labelKey: string; fallback: string }[] = [
  { key: '', labelKey: 'notification.tabAll', fallback: '全部' },
  { key: 'content.generated', labelKey: 'notification.tabContent', fallback: '内容生成' },
  { key: 'distribution.published', labelKey: 'notification.tabDistribution', fallback: '分发' },
  { key: 'subscription.expired', labelKey: 'notification.tabSubscription', fallback: '订阅' },
  { key: 'account.expiring_soon', labelKey: 'notification.tabAccount', fallback: '账号' },
]

// 注意：tab key 用单个 type 不够覆盖（"内容生成"应包含 generated + generation_failed）
// 用前缀匹配后端筛选；后端 type 字段精确匹配，我们前端按 prefix 拉两类
const TAB_PREFIX: Record<string, string[]> = {
  '': [],
  'content.generated': ['content.generated', 'content.generation_failed'],
  'distribution.published': ['distribution.published', 'distribution.failed', 'distribution.scheduled'],
  'subscription.expired': ['subscription.expired', 'subscription.expiring_soon'],
  'account.expiring_soon': ['account.expiring_soon'],
}

export default function NotificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const { page, pageSize, total, setTotal, onChange, reset, pages } = usePagination(20)
  const [tab, setTab] = useState<string>('')
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [detailItem, setDetailItem] = useState<NotificationItem | null>(null)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const removeFromStore = useNotificationStore((s) => s.remove)

  // 仅后台系统通知（admin.broadcast）点击打开详情弹窗；其他类型保持原导航行为
  const handleOpenDetail = useCallback((item: NotificationItem) => {
    if (item.type === 'admin.broadcast') {
      setDetailItem(item)
    }
  }, [])

  const detailMeta = detailItem ? getTypeMeta(detailItem.type) : null
  const DetailIcon = detailMeta?.icon

  // 把单 tab 的多 type 用 OR 拉一次。后端只支持单 type 参数，所以多 type 时不传 type，前端再过滤。
  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const prefixes = TAB_PREFIX[tab] || []
      const useServerFilter = prefixes.length === 1
      const data = await notificationApi.list({
        page,
        pageSize,
        type: useServerFilter ? prefixes[0] : undefined,
      })
      let rows = data?.items ?? []
      if (prefixes.length > 1) {
        const set = new Set(prefixes)
        rows = rows.filter((r) => set.has(r.type))
      }
      setItems(rows)
      setTotal(data?.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, tab, setTotal])

  useEffect(() => {
    void fetch()
  }, [fetch])

  const handleTabChange = (next: string) => {
    if (next === tab) return
    setTab(next)
    reset()
  }

  const handleMarkAll = async () => {
    await markAllRead()
    void fetch()
  }

  // 删除后同步 panel store
  useEffect(() => {
    const handler = () => void fetch()
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [fetch])

  const handleDelete = useCallback(
    (id: string) => {
      // 1) 本地立即移除
      setItems((prev) => prev.filter((it) => it.id !== id))
      setTotal(Math.max(0, total - 1))
      // 2) 走 store（store 内部调 API + 维护 panel state）
      void removeFromStore(id)
    },
    [removeFromStore, setTotal, total],
  )

  const hasItems = items.length > 0

  return (
    <PageContainer>
      <PageHeader
        title={t('notification.title', '消息通知')}
        description={t('notification.pageDesc', '查看所有系统消息与业务事件提醒')}
        icon={Bell}
        iconAccent="primary"
        actions={
          <Button variant="outline" size="sm" onClick={() => void handleMarkAll()} className="cursor-pointer">
            {t('notification.markAllRead', '全部已读')}
          </Button>
        }
      />

      {/* Tab 筛选 */}
      <div className="mb-4 inline-flex items-center gap-1 rounded-lg bg-muted/60 p-1">
        {TYPE_TABS.map((tabDef) => (
          <button
            key={tabDef.key || 'all'}
            type="button"
            onClick={() => handleTabChange(tabDef.key)}
            className={cn(
              'cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition',
              tab === tabDef.key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(tabDef.labelKey, tabDef.fallback)}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            {t('common.loading', '加载中…')}
          </div>
        ) : !hasItems ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Bell className="size-6 opacity-50" />
            </div>
            <span>{t('notification.empty', '暂无通知')}</span>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {items.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                showDelete
                onRemove={handleDelete}
                onOpenDetail={item.type === 'admin.broadcast' ? handleOpenDetail : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* 分页 */}
      {hasItems && pages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {t('common.total', '共')} {total} · {t('common.page', '第')} {page} / {pages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onChange(page - 1)}
              className="cursor-pointer"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => onChange(page + 1)}
              className="cursor-pointer"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* 系统通知详情弹框（仅 admin.broadcast） */}
      <Dialog
        open={Boolean(detailItem)}
        onOpenChange={(o) => {
          if (!o) setDetailItem(null)
        }}
      >
        <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
          <DialogHeader className="space-y-0 border-b border-border bg-card px-6 py-4">
            <div className="flex items-start gap-3">
              {detailMeta && DetailIcon && (
                <div
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-xl',
                    TONE_CLASSES[detailMeta.tone].bg,
                  )}
                >
                  <DetailIcon
                    className={cn('size-5', TONE_CLASSES[detailMeta.tone].text)}
                    strokeWidth={2.2}
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <DialogTitle className="break-words text-base font-semibold leading-tight text-foreground">
                  {detailItem?.title ?? ''}
                </DialogTitle>
                {detailItem?.createdAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatRelativeTime(detailItem.createdAt)}
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* 正文：Markdown 渲染（最小高度避免短文本时弹窗过扁） */}
          <div className="max-h-[60vh] min-h-[240px] overflow-y-auto px-6 py-5">
            {detailItem?.message ? (
              <MarkDown2 content={detailItem.message} theme={resolvedTheme} />
            ) : (
              <p className="text-sm italic text-muted-foreground">{t('notification.emptyMessage', '（无正文内容）')}</p>
            )}
          </div>

          <DialogFooter className="border-t border-border bg-muted/30 px-6 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDetailItem(null)}
              className="cursor-pointer"
            >
              {t('common.close', '关闭')}
            </Button>
            {detailItem?.linkUrl && (
              <Button
                type="button"
                onClick={() => {
                  const url = detailItem.linkUrl!.trim()
                  setDetailItem(null)
                  if (/^https?:\/\//i.test(url)) {
                    window.open(url, '_blank', 'noopener,noreferrer')
                  } else if (url.startsWith('/')) {
                    navigate(url)
                  }
                }}
                className="cursor-pointer gap-1.5"
              >
                <ExternalLink className="size-3.5" strokeWidth={2.25} />
                {t('notification.openLink', '立即跳转')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}

