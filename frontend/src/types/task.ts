export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Task {
  id: string
  user_id: string
  type: string
  status: TaskStatus
  params: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error_message: string | null
  progress: number | null
  created_at: string
  updated_at: string
}
