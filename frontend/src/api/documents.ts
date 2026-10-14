import api from './index'
import type { Document as Doc, DocumentChunk } from '@/types/document'
import type { PaginatedData } from '@/types/api'

export const documentsApi = {
  list: (params?: { page?: number; page_size?: number; status?: string; q?: string }) =>
    api.get<any, PaginatedData<Doc>>('/documents', { params }),
  upload: (file: File, data?: Record<string, string>) => {
    const formData = new FormData()
    formData.append('file', file)
    if (data) Object.entries(data).forEach(([k, v]) => formData.append(k, v))
    return api.post<any, Doc>('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000, // 大文件上传放宽至 10min（默认 2min 不够）
    })
  },
  get: (id: string) => api.get<any, Doc>(`/documents/${id}`),
  chunks: (id: string, params?: { page?: number; page_size?: number }) =>
    api.get<any, PaginatedData<DocumentChunk>>(`/documents/${id}/chunks`, { params }),
  download: (id: string) => api.get<any, { url: string }>(`/documents/${id}/download`),
  update: (id: string, data: Record<string, unknown>) => api.put<any, Doc>(`/documents/${id}`, data),
  delete: (id: string) => api.delete(`/documents/${id}`),
  reprocess: (id: string) => api.post(`/documents/${id}/reprocess`),
}
