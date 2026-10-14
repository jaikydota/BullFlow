import api from './index'
import type { GenerationSchedule, ScheduleRequest } from '@/types/generationSchedule'
import type { PaginatedData } from '@/types/api'

export const scheduleApi = {
  list: (params?: { page?: number; page_size?: number; type?: string }) =>
    api.get<any, PaginatedData<GenerationSchedule>>('/generation/schedules', { params }),

  get: (id: string) =>
    api.get<any, GenerationSchedule>(`/generation/schedules/${id}`),

  create: (data: ScheduleRequest) =>
    api.post<any, GenerationSchedule>('/generation/schedules', data),

  update: (id: string, data: ScheduleRequest) =>
    api.put<any, GenerationSchedule>(`/generation/schedules/${id}`, data),

  delete: (id: string) =>
    api.delete(`/generation/schedules/${id}`),

  toggle: (id: string) =>
    api.patch<any, GenerationSchedule>(`/generation/schedules/${id}/toggle`),

  runNow: (id: string) =>
    api.post<any, { message: string }>(`/generation/schedules/${id}/run-now`),
}
