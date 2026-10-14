import api from './index'
import type { PaginatedData } from '@/types/api'
import type { Customer, CustomerCreate, CustomerUpdate } from '@/types/customer'

export const customersApi = {
  list: (params?: { page?: number; page_size?: number; search?: string }) =>
    api.get<any, PaginatedData<Customer>>('/customers', { params }),
  create: (data: CustomerCreate) => api.post<any, Customer>('/customers', data),
  update: (id: string, data: CustomerUpdate) => api.put<any, Customer>(`/customers/${id}`, data),
  delete: (id: string) => api.delete(`/customers/${id}`),
}
