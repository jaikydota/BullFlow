import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageIcon, Library, Plus, Upload, X } from 'lucide-react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { cn } from '@/utils/helpers'
import { ImageLibraryPicker, type PickedImage } from '@/components/generation/ImageLibraryPicker'
import { FieldLabel } from '@/components/generation/FieldLabel'

/** 一条参考图：来自本地上传（file）或媒体库（url 已就绪）。 */
export type RefImage = {
  /** 去重 key：媒体库 `lib:{id}` / 本地 `up:{name}:{size}:{lastModified}` */
  key: string
  /** 媒体库图片的原图 URL；本地上传项为空（生成时上传后解析） */
  url?: string
  /** 展示用预览 URL（媒体库缩略图）；本地上传项为空（组件内生成 blob 预览） */
  previewUrl?: string
  /** 本地上传文件；媒体库项为空 */
  file?: File
  title?: string
}

export type MultiRefImageUploadProps = {
  items: RefImage[]
  onChange: (items: RefImage[]) => void
  /** 最多可选数量（按模型上限传入） */
  max?: number
  disabled?: boolean
  label?: string
  className?: string
}

const MAX_SIZE = 10 * 1024 * 1024

function fileKey(f: File): string {
  return `up:${f.name}:${f.size}:${f.lastModified}`
}

/**
 * 多参考图选择（受控）—— 支持「本地上传」+「从媒体库选择」两种来源。
 * 本地文件仅缓存，生成时由父组件上传到 MinIO；媒体库图片已有 URL，直接使用。
 * 展示「已选 M / N」引导，超上限自动截断。
 */
export function MultiRefImageUpload({
  items,
  onChange,
  max = 8,
  disabled = false,
  label,
  className,
}: MultiRefImageUploadProps) {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  // 为本地上传项生成 blob 预览，变化/卸载时回收
  const blobMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const it of items) {
      if (it.file && !it.previewUrl) m.set(it.key, URL.createObjectURL(it.file))
    }
    return m
  }, [items])
  useEffect(() => {
    return () => { blobMap.forEach((u) => URL.revokeObjectURL(u)) }
  }, [blobMap])

  const remaining = Math.max(0, max - items.length)
  const single = max === 1

  const addFiles = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setError(null)
      if (rejected[0]) {
        const e = rejected[0].errors[0]
        setError(e?.code === 'file-too-large' ? `单张图片不能超过 10MB` : '不支持该格式')
        return
      }
      if (!accepted.length) return
      const existing = new Set(items.map((i) => i.key))
      const fresh = accepted
        .map((f) => ({ key: fileKey(f), file: f, title: f.name }) as RefImage)
        .filter((i) => !existing.has(i.key))
      const room = max - items.length
      if (fresh.length > room) setError(`最多 ${max} 张，已忽略多余 ${fresh.length - room} 张`)
      onChange([...items, ...fresh.slice(0, room)])
    },
    [items, max, onChange],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: addFiles,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxSize: MAX_SIZE,
    noClick: true,
    multiple: !single,
    disabled: disabled || remaining === 0,
  })

  const addFromLibrary = useCallback(
    (picked: PickedImage[]) => {
      setError(null)
      const existing = new Set(items.map((i) => i.key))
      const fresh = picked
        .map((p) => ({ key: `lib:${p.id}`, url: p.url, previewUrl: p.thumb, title: p.title }) as RefImage)
        .filter((i) => !existing.has(i.key))
      const room = max - items.length
      onChange([...items, ...fresh.slice(0, room)])
    },
    [items, max, onChange],
  )

  const removeAt = (idx: number) => {
    setError(null)
    onChange(items.filter((_, i) => i !== idx))
  }

  const previewOf = (it: RefImage) => it.previewUrl ?? blobMap.get(it.key) ?? ''

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>{label ?? t('generation.referenceImage', '参考图')}</FieldLabel>
        <div className="flex items-center gap-2">
          {!single && <span className="text-xs text-muted-foreground">已选 {items.length} / {max} 张</span>}
          <button
            type="button"
            onClick={() => { if (!disabled && remaining > 0) setPickerOpen(true) }}
            disabled={disabled || remaining === 0}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-foreground/[0.06] px-2.5 py-1 text-xs font-semibold text-foreground shadow-xs transition-app hover:-translate-y-px hover:border-foreground/25 hover:bg-foreground/[0.1] hover:shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Library className="size-3.5 text-muted-foreground" />从媒体库选择
          </button>
        </div>
      </div>

      <div
        {...getRootProps()}
        className={cn(
          'rounded-2xl border-2 border-dashed p-3 transition-app',
          isDragActive ? 'border-primary/40 bg-primary/[0.04]' : 'border-border bg-card/40',
          disabled && 'opacity-60',
        )}
      >
        <input {...getInputProps()} />
        <div className={cn('grid gap-2', single ? 'grid-cols-3' : 'grid-cols-4 sm:grid-cols-5')}>
          {items.map((it, idx) => (
            <div key={it.key} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
              {previewOf(it)
                ? <img src={previewOf(it)} alt="" className="size-full object-cover" />
                : <div className="flex size-full items-center justify-center text-muted-foreground"><ImageIcon className="size-5" /></div>}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeAt(idx) }}
                  className="absolute right-1 top-1 flex size-5 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive"
                  aria-label="移除"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          ))}

          {remaining > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (!disabled) open() }}
              disabled={disabled}
              className={cn(
                'flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-app',
                !disabled && 'hover:border-primary/40 hover:text-primary hover:bg-primary/[0.04]',
              )}
            >
              {items.length === 0 ? <Upload className="size-5" /> : <Plus className="size-5" />}
              <span className="text-[10px] leading-tight">上传</span>
            </button>
          )}
        </div>

        {items.length === 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            点击/拖拽上传，或从「媒体库」选择{single ? '' : `，最多 ${max} 张`} · PNG/JPG/WebP ≤ 10MB
          </p>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <ImageLibraryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={addFromLibrary}
        max={remaining}
      />
    </div>
  )
}
