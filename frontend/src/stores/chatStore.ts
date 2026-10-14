import { create } from 'zustand'
import type { ChatSession, ChatMessage, GenerationResult, ExportResult } from '@/types/chat'
import { chatApi } from '@/api/chat'

interface ChatState {
  sessions: ChatSession[]
  currentSessionId: string | null
  messages: ChatMessage[]
  streaming: boolean
  streamContent: string
  streamGenerationResults: GenerationResult[]
  streamExportResults: ExportResult[]

  loadSessions: () => Promise<void>
  createSession: (data: { title?: string; model_provider?: string; model_name?: string }) => Promise<string>
  deleteSession: (id: string) => Promise<void>
  setCurrentSession: (id: string) => void
  loadMessages: (sessionId: string) => Promise<void>
  clearMessages: () => void
  addMessage: (message: ChatMessage) => void
  setStreaming: (v: boolean) => void
  appendStreamChunk: (chunk: string) => void
  appendGenerationResult: (result: GenerationResult) => void
  appendExportResult: (result: ExportResult) => void
  finishStream: (message: ChatMessage) => void
  updateMessageTtsUrl: (messageId: string, url: string) => void
  updateMessageGenerationStatus: (messageId: string, generationId: string, status: GenerationResult['status']) => void
  cancelStream: () => void
  reset: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  messages: [],
  streaming: false,
  streamContent: '',
  streamGenerationResults: [],
  streamExportResults: [],

  loadSessions: async () => {
    const data = await chatApi.listSessions({ page: 1, page_size: 100 })
    set({ sessions: data.items })
  },

  createSession: async (data) => {
    const session = await chatApi.createSession(data)
    set((s) => ({ sessions: [session, ...s.sessions], currentSessionId: session.id }))
    return session.id
  },

  deleteSession: async (id) => {
    await chatApi.deleteSession(id)
    set((s) => ({
      sessions: s.sessions.filter((s2) => s2.id !== id),
      currentSessionId: s.currentSessionId === id ? null : s.currentSessionId,
      messages: s.currentSessionId === id ? [] : s.messages,
    }))
  },

  setCurrentSession: (id) =>
    set({ currentSessionId: id, messages: [], streamContent: '', streamGenerationResults: [], streamExportResults: [] }),

  loadMessages: async (sessionId) => {
    const msgs = await chatApi.getMessages(sessionId)
    set((s) => {
      if (s.streaming && s.currentSessionId === sessionId) {
        return { currentSessionId: sessionId }
      }
      return { messages: msgs, currentSessionId: sessionId }
    })
  },

  clearMessages: () => set({ messages: [], streamContent: '', currentSessionId: null, streamGenerationResults: [], streamExportResults: [] }),

  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),

  setStreaming: (v) =>
    set({
      streaming: v,
      streamContent: v ? '' : get().streamContent,
      streamGenerationResults: v ? [] : get().streamGenerationResults,
      streamExportResults: v ? [] : get().streamExportResults,
    }),

  appendStreamChunk: (chunk) => set((s) => ({ streamContent: s.streamContent + chunk })),

  appendGenerationResult: (result) =>
    set((s) => ({
      streamGenerationResults: [
        ...s.streamGenerationResults.filter((r) => r.generation_id !== result.generation_id),
        result,
      ],
    })),

  appendExportResult: (result) =>
    set((s) => ({
      streamExportResults: [
        ...s.streamExportResults.filter((r) => r.generation_id !== result.generation_id || r.format !== result.format),
        result,
      ],
    })),

  finishStream: (message) =>
    set((s) => {
      const genResults = s.streamGenerationResults
      const expResults = s.streamExportResults
      const finalMessage: ChatMessage = {
        ...message,
        generation_results:
          genResults.length > 0
            ? genResults
            : (message.generation_results ?? null),
        export_results:
          expResults.length > 0
            ? expResults
            : (message.export_results ?? null),
      }
      return {
        messages: [...s.messages, finalMessage],
        streaming: false,
        streamContent: '',
        streamGenerationResults: [],
        streamExportResults: [],
      }
    }),

  updateMessageTtsUrl: (messageId, url) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, tts_audio_url: url } : m,
      ),
    })),

  updateMessageGenerationStatus: (messageId, generationId, status) =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId || !m.generation_results) return m
        return {
          ...m,
          generation_results: m.generation_results.map((r) =>
            r.generation_id === generationId ? { ...r, status } : r,
          ),
        }
      }),
    })),

  cancelStream: () => set({ streaming: false, streamContent: '', streamGenerationResults: [], streamExportResults: [] }),

  reset: () =>
    set({
      sessions: [],
      currentSessionId: null,
      messages: [],
      streaming: false,
      streamContent: '',
      streamGenerationResults: [],
      streamExportResults: [],
    }),
}))
