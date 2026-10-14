import api from './index'

export type UnifiedDocResult = {
  id: string
  chunk_id: string
  title: string
  file_name: string
  file_type: string
  content: string
  score: number
  source: string
  highlight_content: string[]
}

export type UnifiedImageResult = {
  id: string
  title: string
  url: string
  score: number
  created_at: string
}

export type UnifiedAudioResult = {
  id: string
  title: string
  url: string
  snippet: string
  transcript: string
  created_at: string
}

export type UnifiedVideoResult = {
  id: string
  title: string
  url: string
  cover_url: string | null
  created_at: string
}

export type UnifiedSearchResponse = {
  documents: UnifiedDocResult[]
  images: UnifiedImageResult[]
  audios: UnifiedAudioResult[]
  videos: UnifiedVideoResult[]
  total: number
}

export const searchApi = {
  unified: (data: { query: string; top_k?: number }) =>
    api.post<unknown, UnifiedSearchResponse>('/search/unified', data),
}
