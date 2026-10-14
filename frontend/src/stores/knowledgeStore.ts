import { create } from 'zustand'
import type { SearchResult, ImageSearchResult } from '@/types/knowledge'
import { knowledgeApi } from '@/api/knowledge'

interface KnowledgeState {
  searchResults: SearchResult[]
  imageResults: ImageSearchResult[]
  searchLoading: boolean
  total: number

  search: (query: string, options?: { top_k?: number; use_reranker?: boolean; category?: string; document_ids?: string[] }) => Promise<void>
  searchText: (query: string, options?: { top_k?: number; category?: string }) => Promise<void>
  searchVector: (query: string, options?: { top_k?: number }) => Promise<void>
  searchImage: (query: string, options?: { top_k?: number }) => Promise<void>
  clearResults: () => void
}

export const useKnowledgeStore = create<KnowledgeState>((set) => ({
  searchResults: [],
  imageResults: [],
  searchLoading: false,
  total: 0,

  search: async (query, options) => {
    set({ searchLoading: true })
    try {
      const data = await knowledgeApi.search({
        query,
        top_k: options?.top_k,
        use_reranker: options?.use_reranker,
        filters: { category: options?.category, document_ids: options?.document_ids },
      })
      set({ searchResults: data.results, imageResults: [], total: data.total })
    } catch (e) {
      set({ searchResults: [], imageResults: [], total: 0 })
      throw e
    } finally {
      set({ searchLoading: false })
    }
  },

  searchText: async (query, options) => {
    set({ searchLoading: true })
    try {
      const data = await knowledgeApi.searchText({ query, ...options })
      set({ searchResults: data.results, imageResults: [], total: data.total })
    } catch (e) {
      set({ searchResults: [], imageResults: [], total: 0 })
      throw e
    } finally {
      set({ searchLoading: false })
    }
  },

  searchVector: async (query, options) => {
    set({ searchLoading: true })
    try {
      const data = await knowledgeApi.searchVector({ query, ...options })
      set({ searchResults: data.results, imageResults: [], total: data.total })
    } catch (e) {
      set({ searchResults: [], imageResults: [], total: 0 })
      throw e
    } finally {
      set({ searchLoading: false })
    }
  },

  searchImage: async (query, options) => {
    set({ searchLoading: true })
    try {
      const data = await knowledgeApi.searchImage({ query, ...options })
      set({ imageResults: data.results, searchResults: [], total: data.total })
    } catch (e) {
      set({ searchResults: [], imageResults: [], total: 0 })
      throw e
    } finally {
      set({ searchLoading: false })
    }
  },

  clearResults: () => set({ searchResults: [], imageResults: [], total: 0 }),
}))
