import { X } from 'lucide-react'
import { useCallback, useState, type KeyboardEvent } from 'react'
import { cn } from '@/utils/helpers'

export type TagInputProps = {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  maxTags?: number
  className?: string
}

export function TagInput({
  value,
  onChange,
  placeholder = 'Add a tag',
  maxTags,
  className,
}: TagInputProps) {
  const [draft, setDraft] = useState('')

  const commit = useCallback(
    (raw: string) => {
      const t = raw.trim()
      if (!t) return
      if (maxTags != null && value.length >= maxTags) return
      if (value.includes(t)) {
        setDraft('')
        return
      }
      onChange([...value, t])
      setDraft('')
    },
    [maxTags, onChange, value],
  )

  const removeAt = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index))
    },
    [onChange, value],
  )

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit(draft)
      return
    }
    if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault()
      removeAt(value.length - 1)
    }
  }

  return (
    <div
      className={cn(
        'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.12] bg-bg-surface/50 px-2.5 py-1.5 transition-app',
        'focus-within:border-neon-cyan/40 focus-within:shadow-sm focus-within:ring-2 focus-within:ring-neon-cyan/20',
        className,
      )}
    >
      {value.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-neon-cyan/[0.08] py-0.5 pl-2.5 pr-1 text-xs font-semibold text-neon-cyan border border-neon-cyan/20"
        >
          <span className="truncate">{tag}</span>
          <button
            type="button"
            onClick={() => removeAt(i)}
            className="cursor-pointer rounded-full p-0.5 text-neon-cyan/60 transition-app hover:bg-neon-cyan/[0.12] hover:text-neon-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/40"
            aria-label={`Remove ${tag}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (draft.trim()) commit(draft)
        }}
        placeholder={value.length === 0 ? placeholder : ''}
        disabled={maxTags != null && value.length >= maxTags}
        className="min-w-[8rem] flex-1 bg-transparent py-1 text-sm text-text-primary placeholder:text-text-dim focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  )
}
