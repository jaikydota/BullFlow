import api from './index'
import type { KnowledgeSearchRequest, SearchResult, ImageSearchResult } from '@/types/knowledge'

export const knowledgeApi = {
  search: (data: KnowledgeSearchRequest) =>
    api.post<any, { results: SearchResult[]; total: number }>('/knowledge/search', data),
  searchText: (data: { query: string; top_k?: number; document_ids?: string[]; category?: string }) =>
    api.post<any, { results: SearchResult[]; total: number }>('/knowledge/search/text', data),
  searchVector: (data: { query: string; top_k?: number; document_ids?: string[] }) =>
    api.post<any, { results: SearchResult[]; total: number }>('/knowledge/search/vector', data),
  searchImage: (data: { query: string; top_k?: number }) =>
    api.post<any, { results: ImageSearchResult[]; total: number }>('/knowledge/search/image', data),
}
