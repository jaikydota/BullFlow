import { useCallback, useRef } from 'react'
import type { SSEEvent } from '@/types/chat'

interface UseSSEOptions {
  onContext?: (data: unknown) => void
  onContent?: (text: string) => void
  onDone?: (data: unknown) => void
  onGeneration?: (data: unknown) => void
  onExportResult?: (data: unknown) => void
  onError?: (error: Error) => void
}

export function useSSE() {
  const abortRef = useRef<AbortController | null>(null)

  const start = useCallback(
    async (url: string, body: Record<string, unknown>, options: UseSSEOptions) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const token = (window as any).__AUTH_TOKEN__

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        if (!response.body) throw new Error('No response body')

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const jsonStr = line.slice(6).trim()
            if (!jsonStr) continue

            try {
              const event: SSEEvent = JSON.parse(jsonStr)
              switch (event.type) {
                case 'context':
                  options.onContext?.(event.data)
                  break
                case 'content':
                  options.onContent?.(event.data as string)
                  break
                case 'done':
                  options.onDone?.(event.data)
                  break
                case 'generation':
                  options.onGeneration?.(event.data)
                  break
                case 'export_result':
                  options.onExportResult?.(event.data)
                  break
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          options.onError?.(err as Error)
        }
      }
    },
    []
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  return { start, stop }
}
