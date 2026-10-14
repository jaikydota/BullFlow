import { create } from 'zustand'

import { clearAdminToken, getAdminToken, setAdminToken } from '@/lib/admin-token'

export type AdminUserInfo = {
  id: string
  email: string
  nickname?: string | null
  role: 'super_admin' | 'admin' | 'user' | 'sales' | 'finance'
  language?: string
} | null

type AdminAuthState = {
  token: string | null
  user: AdminUserInfo
  loading: boolean
  hydrate: () => void
  login: (token: string, user: AdminUserInfo) => void
  setUser: (user: AdminUserInfo) => void
  logout: () => void
}

export const useAdminAuthStore = create<AdminAuthState>((set) => ({
  token: null,
  user: null,
  loading: false,
  hydrate: () => {
    const token = getAdminToken()
    set({ token })
  },
  login: (token, user) => {
    setAdminToken(token)
    set({ token, user })
  },
  setUser: (user) => set({ user }),
  logout: () => {
    clearAdminToken()
    set({ token: null, user: null })
  },
}))
