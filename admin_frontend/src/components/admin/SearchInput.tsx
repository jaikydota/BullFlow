import * as React from 'react'
import { Search, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

export type SearchInputProps = {
  value: string
  onChange: (value: string) => void
  /** 防抖触发；不传则受控同步触发 */
  onDebouncedChange?: (value: string) => void
  placeholder?: string
  /** 防抖延迟 ms，默认 250 */
  debounce?: number
  /** Enter 提交（不防抖立即触发） */
  onSubmit?: (value: string) => void
  className?: string
  autoFocus?: boolean
}

/** 列表页通用搜索框：左侧 Search 图标 + 右侧清除按钮 + 内置防抖 */
export function SearchInput({
  value,
  onChange,
  onDebouncedChange,
  placeholder = '搜索…',
  debounce = 250,
  onSubmit,
  className,
  autoFocus,
}: SearchInputProps) {
  const debounced = useDebouncedValue(value, debounce)
  const lastRef = React.useRef<string>(value)
  React.useEffect(() => {
    if (!onDebouncedChange) return
    if (debounced === lastRef.current) return
    lastRef.current = debounced
    onDebouncedChange(debounced)
  }, [debounced, onDebouncedChange])

  return (
    <div className={cn('relative w-full max-w-xs', className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        strokeWidth={2.25}
      />
      <Input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmit) {
            e.preventDefault()
            onSubmit(value)
          }
        }}
        placeholder={placeholder}
        className="h-9 pl-8 pr-8"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="清除"
        >
          <X className="size-3.5" strokeWidth={2.25} />
        </button>
      )}
    </div>
  )
}
