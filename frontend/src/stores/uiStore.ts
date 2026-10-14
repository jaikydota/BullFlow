import { create } from 'zustand'
import { storage } from '@/utils/storage'

interface UIState {
  sidebarCollapsed: boolean
  sidebarOpen: boolean
  language: string

  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setLanguage: (lang: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: storage.get<boolean>('sidebar_collapsed') ?? false,
  sidebarOpen: false,
  language: storage.get<string>('language') ?? 'zh-CN',

  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed
      storage.set('sidebar_collapsed', next)
      return { sidebarCollapsed: next }
    }),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setLanguage: (lang) => {
    storage.set('language', lang)
    set({ language: lang })
  },
}))
