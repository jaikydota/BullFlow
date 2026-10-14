import api from '@/api'
import type { Subscription } from '@/types/subscription'

export const subscriptionApi = {
  /** 当前用户的活跃订阅 + 4 维度额度 */
  getMe: () => api.get<unknown, Subscription>('/subscription/me'),
}
