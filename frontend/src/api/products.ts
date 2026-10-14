import api from './index'
import type { Product, ProductCreate, ProductUpdate } from '@/types/product'
import type { PaginatedData } from '@/types/api'

export const productsApi = {
  list: (params?: { page?: number; page_size?: number; brand_id?: string }) =>
    api.get<any, PaginatedData<Product>>('/products', { params }),
  create: (data: ProductCreate) => api.post<any, Product>('/products', data),
  update: (id: string, data: ProductUpdate) => api.put<any, Product>(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
}
