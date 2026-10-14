import { useEffect, useState } from 'react'

/** 在 value 稳定 `delay` 毫秒后才返回最新值，用于搜索输入防抖 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(t)
  }, [value, delay])
  return debounced
}
