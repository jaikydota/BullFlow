import { useRef, type ChangeEvent } from 'react'
import { CheckCircle, CloudUpload, X } from 'lucide-react'

import { toast } from '@/components/common/Toast'
import { cn } from '@/lib/utils'

export type FileUploadProps = {
  accept?: string | Record<string, string[]>
  multiple?: boolean
  files?: File[]
  onFilesChange?: (files: File[]) => void
  onUpload?: (files: File[]) => void | Promise<void>
  maxSize?: number
  maxFiles?: number
  hint?: string
  className?: string
}

function acceptToString(accept: string | Record<string, string[]> | undefined): string | undefined {
  if (!accept) return undefined
  if (typeof accept === 'string') return accept
  return Object.entries(accept)
    .flatMap(([mime, exts]) => [mime, ...exts])
    .join(',')
}

function extractExtensions(accept: string | Record<string, string[]> | undefined): string[] {
  if (!accept) return []
  if (typeof accept === 'string') {
    return accept
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('.'))
      .map((s) => s.slice(1).toUpperCase())
  }
  const exts = Object.values(accept).flat()
  return [...new Set(exts.map((s) => s.replace('.', '').toUpperCase()))]
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

export function FileUpload({
  accept,
  multiple,
  files = [],
  onFilesChange,
  onUpload,
  maxSize,
  maxFiles,
  hint,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const acceptStr = acceptToString(accept)
  const extensions = extractExtensions(accept)

  const handleFiles = (selected: File[]) => {
    // 单文件大小校验：超过 maxSize 的文件直接拒绝（友好提示后丢弃）
    if (maxSize && maxSize > 0) {
      const oversized = selected.filter((f) => f.size > maxSize)
      if (oversized.length > 0) {
        const names = oversized.map((f) => f.name).join('、')
        toast.error(
          oversized.length === 1
            ? `「${names}」超过最大 ${formatBytes(maxSize)} 限制，无法上传`
            : `${oversized.length} 个文件超过最大 ${formatBytes(maxSize)} 限制：${names}`,
        )
        selected = selected.filter((f) => f.size <= maxSize)
        if (selected.length === 0) return
      }
    }
    let next = multiple ? [...files, ...selected] : selected
    if (maxFiles && next.length > maxFiles) next = next.slice(0, maxFiles)
    onFilesChange?.(next)
    if (onUpload) void onUpload(next)
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    handleFiles(selected)
    if (inputRef.current) inputRef.current.value = ''
  }

  const removeFile = (idx: number) => {
    const next = files.filter((_, i) => i !== idx)
    onFilesChange?.(next)
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        className="group relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/30 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const dropped = Array.from(e.dataTransfer.files)
          handleFiles(dropped)
        }}
      >
        <div className="flex flex-col items-center gap-4 px-6 py-8">
          <div className="flex size-14 items-center justify-center rounded-2xl border bg-card text-primary transition-colors group-hover:border-primary/30">
            <CloudUpload className="size-7" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground/90">
              <span className="text-primary group-hover:underline">点击选择文件</span>
              {' 或将文件拖放到此处'}
            </p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          {extensions.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {extensions.map((ext) => (
                <span
                  key={ext}
                  className="inline-flex items-center rounded-md border bg-card px-2 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground"
                >
                  {ext}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
            {maxSize && <span>单文件最大 {formatBytes(maxSize)}</span>}
            {multiple && <span>可同时选择多个文件</span>}
            {maxFiles && <span>最多 {maxFiles} 个</span>}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={acceptStr}
          multiple={multiple}
          className="hidden"
          onChange={handleChange}
        />
      </div>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((file, i) => (
            <li
              key={i}
              className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 shadow-sm"
            >
              <CheckCircle className="size-4 shrink-0 text-emerald-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
