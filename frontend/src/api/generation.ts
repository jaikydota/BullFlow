import api from './index'
import type { ArticleGenRequest, GeneratedContent, ImageGenRequest, VideoGenRequest } from '@/types/generation'
import type { PaginatedData } from '@/types/api'

export const generationApi = {
  // 文章生成统一走异步：提交即建 pending 记录，返回 { id, status }，前端轮询；
  // 断开 / 切换页面不影响后台生成入库。mixed=true 为图文混编。
  generateArticle: (data: ArticleGenRequest) =>
    api.post<unknown, { id: string; status: string }>('/generation/article', { ...data, mixed: false, stream: false }),
  generateArticleMixed: (data: ArticleGenRequest) =>
    api.post<unknown, { id: string; status: string }>('/generation/article', { ...data, mixed: true, stream: false }),
  generateImage: (data: ImageGenRequest) => api.post<unknown, Record<string, unknown>>('/generation/image', data),
  generateVideo: (data: VideoGenRequest) => api.post<unknown, Record<string, unknown>>('/generation/video', data),
  list: (params?: { page?: number; page_size?: number; type?: string }) =>
    api.get<unknown, PaginatedData<GeneratedContent>>('/generation', { params }),
  get: (id: string) => api.get<unknown, GeneratedContent>(`/generation/${id}`),
  delete: (id: string) => api.delete(`/generation/${id}`),
  /** 导出文章为 docx / pdf，触发浏览器下载 */
  exportArticle: async (id: string, format: 'docx' | 'pdf', filename: string) => {
    const resp = await api.get(`/generation/${id}/export`, {
      params: { format },
      responseType: 'blob',
    })
    const blob = new Blob([resp as unknown as BlobPart], {
      type: format === 'pdf' ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.${format}`
    a.click()
    URL.revokeObjectURL(url)
  },
}
