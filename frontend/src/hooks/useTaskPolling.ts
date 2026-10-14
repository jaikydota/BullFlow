import { useState, useEffect, useRef, useCallback } from 'react'
import { tasksApi } from '@/api/tasks'
import type { Task } from '@/types/task'

interface UseTaskPollingOptions {
  interval?: number
  onComplete?: (task: Task) => void
  onFailed?: (task: Task) => void
}

export function useTaskPolling(taskId: string | null, options: UseTaskPollingOptions = {}) {
  const { interval = 3000, onComplete, onFailed } = options
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const poll = useCallback(async () => {
    if (!taskId) return
    try {
      const t = await tasksApi.get(taskId)
      setTask(t)
      if (t.status === 'completed') {
        clearInterval(timerRef.current)
        onComplete?.(t)
      } else if (t.status === 'failed' || t.status === 'cancelled') {
        clearInterval(timerRef.current)
        onFailed?.(t)
      }
    } catch {
      // ignore polling errors
    }
  }, [taskId, onComplete, onFailed])

  useEffect(() => {
    if (!taskId) return
    setLoading(true)
    poll()
    timerRef.current = setInterval(poll, interval)
    return () => {
      clearInterval(timerRef.current)
      setLoading(false)
    }
  }, [taskId, interval, poll])

  return { task, loading }
}
