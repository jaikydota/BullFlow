import { useEffect } from 'react'

import { useAuthStore } from '@/stores/authStore'
import { useNotificationStore } from '@/stores/notificationStore'

/**
 * 站内通知未读数（不做定时轮询，省算力）：
 * - 登录后拉取一次（让铃铛初始有数）；登出时清空状态。
 * - 之后由用户操作触发刷新：点击一级 4 个模块按钮 / 两个头像按钮时各拉一次
 *   （见 Sidebar / Header 里的 useNotificationStore.getState().refreshCount()）。
 * 挂在 AppLayout 顶层调用一次即可。
 */
export function useNotificationRefresh() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const refreshCount = useNotificationStore((s) => s.refreshCount)
  const reset = useNotificationStore((s) => s.reset)

  useEffect(() => {
    if (isAuthenticated) {
      refreshCount()
    } else {
      reset()
    }
  }, [isAuthenticated, refreshCount, reset])
}
