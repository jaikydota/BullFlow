import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/utils/helpers'

export type RichTextEditorProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write markdown…',
  className,
}: RichTextEditorProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-white/[0.12] bg-bg-surface shadow-sm',
        className,
      )}
    >
      <div className="flex border-b border-white/[0.08] bg-bg-surface/80 px-2 py-1.5">
        <div className="inline-flex rounded-lg bg-white/[0.04] p-0.5">
          <button
            type="button"
            onClick={() => setMode('edit')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-app',
              mode === 'edit'
                ? 'bg-white/[0.08] text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary',
            )}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-app',
              mode === 'preview'
                ? 'bg-white/[0.08] text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary',
            )}
          >
            Preview
          </button>
        </div>
      </div>

      {mode === 'edit' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            'min-h-[200px] w-full resize-y bg-transparent px-4 py-3 text-sm text-text-primary placeholder:text-text-dim',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neon-cyan/20',
          )}
        />
      ) : (
        <div
          className={cn(
            'min-h-[200px] space-y-3 px-4 py-3 text-sm leading-relaxed text-text-secondary',
            '[&_a]:text-neon-cyan [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-white/[0.12] [&_blockquote]:pl-4 [&_blockquote]:text-text-muted',
            '[&_code]:rounded [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.875em] [&_code]:text-neon-green',
            '[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-text-primary [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-text-primary',
            '[&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5',
          )}
        >
          {value.trim() ? (
            <ReactMarkdown>{value}</ReactMarkdown>
          ) : (
            <p className="text-sm text-text-dim">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
