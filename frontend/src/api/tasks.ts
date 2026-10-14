import api from './index'
import type { Task } from '@/types/task'

export const tasksApi = {
  get: (id: string) => api.get<any, Task>(`/tasks/${id}`),
  cancel: (id: string) => api.post(`/tasks/${id}/cancel`),
}
