import api from './index'
import type { PaginatedData } from '@/types/api'
import type { KnowledgeCase, KnowledgeCaseCreate, KnowledgeCaseUpdate } from '@/types/case'

export const casesApi = {
  list: (params?: { page?: number; page_size?: number }) =>
    api.get<any, PaginatedData<KnowledgeCase>>('/cases', { params }),
  create: (data: KnowledgeCaseCreate) => api.post<any, KnowledgeCase>('/cases', data),
  update: (id: string, data: KnowledgeCaseUpdate) =>
    api.put<any, KnowledgeCase>(`/cases/${id}`, data),
  delete: (id: string) => api.delete(`/cases/${id}`),
}
