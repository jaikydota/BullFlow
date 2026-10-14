import api from './index'

export const audiosApi = {
  list: (params: { page?: number; page_size?: number }) =>
    api.get('/audios', { params }),

  upload: (file: File, extra?: { title?: string; category?: string; language?: string }) => {
    const form = new FormData()
    form.append('file', file)
    if (extra?.title) form.append('title', extra.title)
    if (extra?.category) form.append('category', extra.category)
    if (extra?.language) form.append('language', extra.language)
    return api.post('/audios/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000, // 大文件上传放宽至 10min（默认 2min 不够）
    })
  },

  get: (id: string) => api.get(`/audios/${id}`),

  delete: (id: string) => api.delete(`/audios/${id}`),
}
