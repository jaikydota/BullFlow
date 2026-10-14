import api from './index'
import type { PaginatedData } from '@/types/api'

export const videosApi = {
  list: (params?: { page?: number; page_size?: number }) =>
    api.get<any, PaginatedData<Record<string, unknown>>>('/videos', { params }),
  upload: (file: File, data?: Record<string, string>) => {
    const formData = new FormData()
    formData.append('file', file)
    if (data) Object.entries(data).forEach(([k, v]) => formData.append(k, v))
    return api.post('/videos/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000, // 大文件上传放宽至 10min（默认 2min 不够）
    })
  },
  get: (id: string) => api.get(`/videos/${id}`),
  delete: (id: string) => api.delete(`/videos/${id}`),
}
