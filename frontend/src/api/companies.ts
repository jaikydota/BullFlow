import api from './index'
import type { Company, CompanyCreate, CompanyUpdate } from '@/types/company'
import type { PaginatedData } from '@/types/api'

export const companiesApi = {
  list: (params?: { page?: number; page_size?: number }) =>
    api.get<any, PaginatedData<Company>>('/companies', { params }),
  create: (data: CompanyCreate) => api.post<any, Company>('/companies', data),
  update: (id: string, data: CompanyUpdate) => api.put<any, Company>(`/companies/${id}`, data),
  delete: (id: string) => api.delete(`/companies/${id}`),
}
