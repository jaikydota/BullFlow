import api from './index'
import type { ChatSession, ChatMessage, CreateSessionRequest, ModelInfo } from '@/types/chat'
import type { PaginatedData } from '@/types/api'

let modelsCache: ModelInfo[] | null = null
let modelsInFlight: Promise<ModelInfo[]> | null = null

async function getModelsCached(): Promise<ModelInfo[]> {
  if (modelsCache) return modelsCache
  if (modelsInFlight) return modelsInFlight

  modelsInFlight = api
    .get<any, ModelInfo[]>('/chat/models')
    .then((list) => {
      modelsCache = list
      return list
    })
    .finally(() => {
      modelsInFlight = null
    })

  return modelsInFlight
}

export const chatApi = {
  listModels: () => getModelsCached(),
  createSession: (data: CreateSessionRequest) => api.post<any, ChatSession>('/chat/sessions', data),
  listSessions: (params?: { page?: number; page_size?: number }) =>
    api.get<any, PaginatedData<ChatSession>>('/chat/sessions', { params }),
  deleteSession: (id: string) => api.delete(`/chat/sessions/${id}`),
  getMessages: (sessionId: string) =>
    api.get<any, ChatMessage[]>(`/chat/sessions/${sessionId}/messages`),
  generateTts: (messageId: string) =>
    api.post<any, { tts_audio_url: string }>(`/chat/messages/${messageId}/tts`),
  transcribeAudio: (blob: Blob, fileName = 'recording.webm') => {
    const form = new FormData()
    form.append('file', blob, fileName)
    return api.post<any, { text: string }>('/chat/transcribe', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  uploadChatFile: (sessionId: string, file: File) => {
    const form = new FormData()
    form.append('file', file, file.name)
    return api.post<any, ChatMessage>(`/chat/sessions/${sessionId}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  // completions is handled via SSE fetch, not axios
}
