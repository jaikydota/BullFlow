import api from './index'
import type { Brand, BrandCreate, BrandUpdate } from '@/types/brand'
import type { PaginatedData } from '@/types/api'

export const brandsApi = {
  list: (params?: { page?: number; page_size?: number }) =>
    api.get<any, PaginatedData<Brand>>('/brands', { params }),
  create: (data: BrandCreate) => api.post<any, Brand>('/brands', data),
  update: (id: string, data: BrandUpdate) => api.put<any, Brand>(`/brands/${id}`, data),
  delete: (id: string) => api.delete(`/brands/${id}`),
}
