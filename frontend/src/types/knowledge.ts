export interface SearchFilters {
  category?: string
  document_ids?: string[]
}

export interface KnowledgeSearchRequest {
  query: string
  top_k?: number
  filters?: SearchFilters
  use_reranker?: boolean
}

export interface SearchResult {
  chunk_id: string
  document_id: string
  document_title: string
  file_name: string
  file_type: string
  content: string
  score: number
  source: string
  metadata: Record<string, unknown>
  highlight_content?: string[]
  highlight_title?: string[]
}

export interface ImageSearchResult {
  image_id: string
  score: number
}
