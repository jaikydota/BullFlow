import api from './index'

export type NotificationType =
  | 'content.generated'
  | 'content.generation_failed'
  | 'distribution.scheduled'
  | 'distribution.published'
  | 'distribution.failed'
  | 'subscription.expiring_soon'
  | 'subscription.expired'
  | 'account.expiring_soon'
  | 'admin.broadcast'
  | 'order.transfer_approved'
  | 'order.transfer_rejected'
  | 'invoice.issued'
  | 'invoice.rejected'

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  message: string | null
  linkUrl: string | null
  extra: Record<string, unknown> | null
  readAt: string | null
  createdAt: string
}

export interface NotificationListResp {
  items: NotificationItem[]
  total: number
  page: number
  page_size: number
}

export interface NotificationListParams {
  page?: number
  pageSize?: number
  type?: string
  onlyUnread?: boolean
}

export const notificationApi = {
  list: (params: NotificationListParams = {}) => {
    const sp = new URLSearchParams()
    sp.set('page', String(params.page ?? 1))
    sp.set('page_size', String(params.pageSize ?? 20))
    if (params.type) sp.set('type', params.type)
    if (params.onlyUnread) sp.set('only_unread', 'true')
    return api.get<unknown, NotificationListResp>(`/notifications?${sp.toString()}`)
  },
  unreadCount: () => api.get<unknown, { count: number }>('/notifications/unread-count'),
  markRead: (id: string) =>
    api.patch<unknown, { id: string }>(`/notifications/${encodeURIComponent(id)}/read`),
  markAllRead: () => api.post<unknown, { updated: number }>('/notifications/mark-all-read'),
  remove: (id: string) =>
    api.delete<unknown, { id: string }>(`/notifications/${encodeURIComponent(id)}`),
}
