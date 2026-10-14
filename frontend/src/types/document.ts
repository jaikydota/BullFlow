export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface Document {
  id: string
  user_id: string
  title: string
  file_name: string
  file_type: string
  file_path: string
  file_size: number
  status: DocumentStatus
  chunk_count: number | null
  category: string | null
  tags: string[] | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface DocumentChunk {
  id: string
  document_id: string
  chunk_index: number
  content: string
  token_count: number | null
  metadata: Record<string, unknown> | null
}
