import { ImageIcon, Loader2, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { uploadsApi } from '@/api/uploads'
import { cn } from '@/utils/helpers'

export type MinioImageUploadProps = {
  /**
   * 当前值：后端 API 返回的完整公开 URL（后端负责将数据库路径转为 URL），或 null。
   * 组件内部上传完成后，onChange 会回调完整 URL（后端同样会在保存时标准化为路径存储）。
   */
  value?: string | null
  /** 上传成功后回调完整公开 URL；清除时回调 null */
  onChange: (url: string | null) => void
  maxSize?: number
  disabled?: boolean
  className?: string
}

const MAX_DEFAULT = 5 * 1024 * 1024

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function MinioImageUpload({
  value,
  onChange,
  maxSize = MAX_DEFAULT,
  disabled = false,
  className,
}: MinioImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * 上传中先显示 blob 本地预览，上传完成后切换为公开 URL。
   * 其他情况直接用 value（已是公开 URL，浏览器直接加载，无需鉴权）。
   */
  const [blobPreview, setBlobPreview] = useState<string | null>(null)
  const blobRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current)
    }
  }, [])

  const displayUrl = blobPreview ?? value ?? null

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      if (file.size > maxSize) {
        setError(`图片大小不能超过 ${formatSize(maxSize)}`)
        return
      }
      if (!file.type.startsWith('image/')) {
        setError('请选择图片文件')
        return
      }

      // 先显示本地 blob 预览
      if (blobRef.current) URL.revokeObjectURL(blobRef.current)
      const blob = URL.createObjectURL(file)
      blobRef.current = blob
      setBlobPreview(blob)

      setUploading(true)
      try {
        const result = await uploadsApi.uploadImage(file)
        // 上传成功，切换到公开 URL，清除 blob
        setBlobPreview(null)
        if (blobRef.current) {
          URL.revokeObjectURL(blobRef.current)
          blobRef.current = null
        }
        onChange(result.url)
      } catch {
        setError('上传失败，请重试')
        setBlobPreview(null)
        if (blobRef.current) {
          URL.revokeObjectURL(blobRef.current)
          blobRef.current = null
        }
      } finally {
        setUploading(false)
      }
    },
    [maxSize, onChange],
  )

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      if (rejected[0]) {
        const e = rejected[0].errors[0]
        setError(e?.code === 'file-too-large' ? `图片大小不能超过 ${formatSize(maxSize)}` : '不支持该文件格式')
        return
      }
      if (accepted[0]) void handleFile(accepted[0])
    },
    [handleFile, maxSize],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'] },
    maxFiles: 1,
    maxSize,
    noClick: true,
    multiple: false,
    disabled: disabled || uploading,
  })

  const handleRemove = () => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current)
      blobRef.current = null
    }
    setBlobPreview(null)
    setError(null)
    onChange(null)
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div
          {...getRootProps()}
          className={cn(
            'relative flex min-h-[160px] min-w-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-app',
            isDragActive ? 'border-neon-cyan/40 bg-neon-cyan/[0.06]' : 'border-white/[0.12] bg-bg-surface/30',
            !disabled && !uploading && 'hover:border-neon-cyan/30 cursor-pointer',
            (disabled || uploading) && 'opacity-70',
          )}
        >
          <input {...getInputProps()} />

          {uploading ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10">
              <Loader2 className="size-8 animate-spin text-primary-400" aria-hidden />
              <span className="text-sm text-slate-500">上传中...</span>
            </div>
          ) : displayUrl ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (!disabled) open() }}
              disabled={disabled}
              className="group relative block h-48 w-full cursor-pointer disabled:cursor-default"
              aria-label="更换图片"
            >
              <img
                src={displayUrl}
                alt=""
                className="h-full w-full object-contain object-center"
                onError={() => { onChange(null); setError('图片加载失败') }}
              />
              {!disabled && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-app group-hover:bg-black/40">
                  <span className="flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold text-slate-800 opacity-0 shadow-sm transition-app group-hover:opacity-100">
                    <Upload className="size-4" aria-hidden />
                    更换
                  </span>
                </span>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (!disabled) open() }}
              disabled={disabled}
              className="flex w-full cursor-pointer flex-col items-center gap-2 px-6 py-10 disabled:cursor-default"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-50 to-accent-50 ring-1 ring-primary-100/50">
                <ImageIcon className="size-6 text-primary-400" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-slate-700">点击或拖拽上传</span>
              <span className="text-xs text-slate-500">支持 PNG / JPG / GIF / WebP / SVG，最大 {formatSize(maxSize)}</span>
            </button>
          )}
        </div>

        {displayUrl && !uploading ? (
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className={cn(
              'inline-flex cursor-pointer items-center justify-center gap-2 self-start rounded-xl border border-neon-red/20 bg-neon-red/[0.06] px-3 py-2 text-sm font-medium text-neon-red transition-app',
              'hover:bg-red-50 hover:border-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <Trash2 className="size-4" aria-hidden />
            移除
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>
      ) : null}
    </div>
  )
}
