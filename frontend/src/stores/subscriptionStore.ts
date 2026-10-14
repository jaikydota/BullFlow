import { create } from 'zustand'

import { subscriptionApi } from '@/api/subscription'
import type { Subscription } from '@/types/subscription'

interface SubscriptionState {
  subscription: Subscription | null
  loading: boolean
  error: string | null
  fetch: () => Promise<void>
  refresh: () => Promise<void>
  reset: () => void
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  subscription: null,
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null })
    try {
      const sub = await subscriptionApi.getMe()
      set({ subscription: sub, loading: false })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '获取订阅失败'
      set({ loading: false, error: msg })
    }
  },

  refresh: async () => {
    try {
      const sub = await subscriptionApi.getMe()
      set({ subscription: sub })
    } catch {
      /* silent */
    }
  },

  reset: () => set({ subscription: null, loading: false, error: null }),
}))
