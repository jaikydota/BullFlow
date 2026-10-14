import { create } from 'zustand'
import type { GeneratedContent } from '@/types/generation'
import { generationApi } from '@/api/generation'

interface GenerationState {
  history: GeneratedContent[]
  historyTotal: number
  loading: boolean

  loadHistory: (params?: { page?: number; page_size?: number; type?: string }) => Promise<void>
  reset: () => void
}

export const useGenerationStore = create<GenerationState>((set) => ({
  history: [],
  historyTotal: 0,
  loading: false,

  loadHistory: async (params) => {
    set({ loading: true })
    try {
      const data = await generationApi.list(params)
      set({ history: data.items, historyTotal: data.total })
    } catch (e) {
      set({ history: [], historyTotal: 0 })
      throw e
    } finally {
      set({ loading: false })
    }
  },

  reset: () => set({ history: [], historyTotal: 0, loading: false }),
}))
