export interface ChatSession {
  id: string
  user_id: string
  title: string | null
  model_provider: string | null
  model_name: string | null
  system_prompt: string | null
  created_at: string
  updated_at: string
}

export interface GenerationResult {
  generation_id: string
  type: 'article' | 'image' | 'video'
  status: 'pending' | 'generating' | 'completed' | 'failed'
  title?: string
  preview_info?: {
    content?: string      // article: first 300 chars
    file_url?: string     // image/video: full public URL
    thumbnail_url?: string
    media_urls?: string[] // 图文分离=全部图；图文混编=正文内嵌图
    layout?: 'mixed' | 'dynamic' | null
  }
}

export interface ExportResult {
  generation_id: string
  format: 'pdf' | 'docx'
  download_url: string
  title: string
}

export interface UploadResult {
  file_category: 'document' | 'image' | 'video' | 'audio'
  file_name: string
  file_id: string
  file_url: string
  thumbnail_url?: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'deleted'
  error_message?: string
}

export interface ChatMessage {
  id: string
  session_id: string
  user_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  content_type: 'text' | 'image' | 'video' | 'mixed'
  attachments: unknown[] | null
  token_count: number | null
  context_chunks: ContextChunk[] | null
  tts_audio_url: string | null
  generation_results: GenerationResult[] | null
  export_results: ExportResult[] | null
  upload_results: UploadResult[] | null
  created_at: string
}

export interface ContextChunk {
  chunk_id: string
  document_id?: string
  document_title: string
  file_name?: string
  file_type?: string
  score: number
  /** Preview text from retrieval or SSE context events */
  content?: string
}

export interface CreateSessionRequest {
  title?: string
  model_provider?: string
  model_name?: string
  system_prompt?: string
}

export interface ModelInfo {
  provider: string
  model: string
}

export interface SSEEvent {
  type: 'context' | 'content' | 'done' | 'generation' | 'export_result'
  data: unknown
}
