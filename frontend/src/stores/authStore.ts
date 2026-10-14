import { create } from 'zustand'
import type { User } from '@/types/user'
import type { TokenResponse } from '@/types/auth'
import { authApi } from '@/api/auth'
import { storage } from '@/utils/storage'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  loading: boolean

  login: (email: string, password: string, captchaTicket?: string) => Promise<void>
  loginByPhonePassword: (phone: string, password: string, captchaTicket?: string) => Promise<void>
  loginBySms: (phone: string, code: string, invitationCode?: string | null) => Promise<boolean>
  register: (phone: string, code: string, invitationCode?: string | null) => Promise<void>
  logout: () => Promise<void>
  refreshAccessToken: () => Promise<void>
  updateProfile: (data: Partial<User>) => Promise<void>
  setUser: (user: User) => void
  hydrate: () => Promise<void>
  reset: () => void
}

/** 登录/登出时需要重置的、与会话强绑定的本地标记 */
function clearSessionScopedFlags() {
  try {
    // 顶部公告"本次会话不再显示"标记 — 新一次登录应当重新看到
    sessionStorage.removeItem('matrix365_top_notice_dismissed')
  } catch {
    /* ignore */
  }
}

function applyTokens(data: TokenResponse, set: (state: Partial<AuthState>) => void) {
  const token = data.access_token
  ;(window as any).__AUTH_TOKEN__ = token
  storage.set('refresh_token', data.refresh_token)
  clearSessionScopedFlags()
  set({
    accessToken: token,
    refreshToken: data.refresh_token,
    user: data.user as unknown as User,
    isAuthenticated: true,
    loading: false,
  })
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: storage.get<string>('refresh_token'),
  isAuthenticated: false,
  loading: true,

  login: async (email, password, captchaTicket) => {
    const data = await authApi.login({ email, password, captcha_ticket: captchaTicket })
    applyTokens(data, set)
  },

  loginByPhonePassword: async (phone, password, captchaTicket) => {
    const data = await authApi.loginByPhonePassword({ phone, password, captcha_ticket: captchaTicket })
    applyTokens(data, set)
  },

  loginBySms: async (phone, code, invitationCode) => {
    const data = await authApi.loginBySms({ phone, code, invitation_code: invitationCode ?? null })
    applyTokens(data, set)
    return Boolean(data.registered)
  },

  register: async (phone, code, invitationCode) => {
    const data = await authApi.register({ phone, code, invitation_code: invitationCode ?? null })
    applyTokens(data, set)
  },

  logout: async () => {
    try {
      await authApi.logout()
    } catch { /* ignore */ }
    ;(window as any).__AUTH_TOKEN__ = null
    storage.remove('refresh_token')
    clearSessionScopedFlags()
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, loading: false })
  },

  refreshAccessToken: async () => {
    const rt = get().refreshToken || storage.get<string>('refresh_token')
    if (!rt) throw new Error('No refresh token')
    const data = await authApi.refresh({ refresh_token: rt })
    ;(window as any).__AUTH_TOKEN__ = data.access_token
    storage.set('refresh_token', data.refresh_token)
    set({ accessToken: data.access_token, refreshToken: data.refresh_token })
  },

  updateProfile: async (data) => {
    const user = await authApi.updateMe(data as any)
    set({ user })
  },

  setUser: (user) => set({ user, isAuthenticated: true, loading: false }),

  hydrate: async () => {
    const rt = storage.get<string>('refresh_token')
    if (!rt) {
      set({ loading: false })
      return
    }
    try {
      const data = await authApi.refresh({ refresh_token: rt })
      ;(window as any).__AUTH_TOKEN__ = data.access_token
      storage.set('refresh_token', data.refresh_token)
      const user = await authApi.getMe()
      set({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user,
        isAuthenticated: true,
        loading: false,
      })
    } catch {
      storage.remove('refresh_token')
      set({ loading: false })
    }
  },

  reset: () => {
    ;(window as any).__AUTH_TOKEN__ = null
    storage.remove('refresh_token')
    clearSessionScopedFlags()
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, loading: false })
  },
}))
