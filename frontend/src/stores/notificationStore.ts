import { create } from 'zustand'

import { notificationApi, type NotificationItem } from '@/api/notification'

interface NotificationState {
  unreadCount: number
  items: NotificationItem[]
  loading: boolean
  initialLoaded: boolean

  refreshCount: () => Promise<void>
  loadPanelList: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  remove: (id: string) => Promise<void>
  reset: () => void
}

const PANEL_LIMIT = 10

export const useNotificationStore = create<NotificationState>((set, get) => ({
  unreadCount: 0,
  items: [],
  loading: false,
  initialLoaded: false,

  refreshCount: async () => {
    try {
      const data = await notificationApi.unreadCount()
      set({ unreadCount: data?.count ?? 0 })
    } catch {
      /* silent: 后台获取，不打扰用户 */
    }
  },

  loadPanelList: async () => {
    set({ loading: true })
    try {
      const data = await notificationApi.list({ page: 1, pageSize: PANEL_LIMIT })
      set({
        items: data?.items ?? [],
        unreadCount: (data?.items ?? []).filter((it) => !it.readAt).length
          // 若 total > 已加载，未读数以服务端 count 为准（额外拉一次）
          + 0,
        loading: false,
        initialLoaded: true,
      })
      // 顺便刷一次精确未读数（>10 条时面板只显示前 10 条，未读数应取自全量）
      void get().refreshCount()
    } catch {
      set({ loading: false })
    }
  },

  markRead: async (id) => {
    // 乐观更新
    const before = get().items
    set({
      items: before.map((it) =>
        it.id === id && !it.readAt ? { ...it, readAt: new Date().toISOString() } : it,
      ),
      unreadCount: Math.max(0, get().unreadCount - (before.find((it) => it.id === id && !it.readAt) ? 1 : 0)),
    })
    try {
      await notificationApi.markRead(id)
    } catch {
      // 回滚拉一次保险
      void get().loadPanelList()
    }
  },

  markAllRead: async () => {
    const before = get().items
    set({
      items: before.map((it) => (it.readAt ? it : { ...it, readAt: new Date().toISOString() })),
      unreadCount: 0,
    })
    try {
      await notificationApi.markAllRead()
    } catch {
      void get().loadPanelList()
    }
  },

  remove: async (id) => {
    const before = get().items
    const wasUnread = !!before.find((it) => it.id === id && !it.readAt)
    set({
      items: before.filter((it) => it.id !== id),
      unreadCount: Math.max(0, get().unreadCount - (wasUnread ? 1 : 0)),
    })
    try {
      await notificationApi.remove(id)
    } catch {
      void get().loadPanelList()
    }
  },

  reset: () => set({ unreadCount: 0, items: [], loading: false, initialLoaded: false }),
}))
