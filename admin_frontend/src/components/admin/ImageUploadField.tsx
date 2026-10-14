import * as React from 'react'
import { ImagePlus, RotateCcw, Trash2, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { adminFormPost } from '@/lib/api/client'

const DEFAULT_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml'
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export type UploadMode = 'eager' | 'deferred'

export type ImageUploadFieldProps = {
  /** 已上传后的图片公网 URL（受控） */
  value?: string | null
  /** 上传完成回调（eager 模式立即触发；deferred 模式调用 commit() 后触发） */
  onChange: (url: string | null) => void
  /** eager: 选中即上传；deferred: 选中后仅本地预览，调 commit() 才上传 */
  mode?: UploadMode
  /** 上传接口路径（默认 /admin/saas/upload-image） */
  uploadPath?: string
  /** 表单字段名（默认 file） */
  fieldName?: string
  /** 接受的 MIME 类型 */
  accept?: string
  /** 最大文件大小，字节 */
  maxBytes?: number
  /** 占位提示文案 */
  hint?: string
  className?: string
  disabled?: boolean
  /** 预览框尺寸 */
  width?: number
  height?: number
}

export type ImageUploadFieldRef = {
  /** deferred 模式下显式触发上传，resolve 上传后的 URL（无文件时返回 value 或 null） */
  commit: () => Promise<string | null>
  /** 当前是否有待上传文件（deferred 模式） */
  isPending: () => boolean
}

/** 图片上传字段（封装 MinIO 上传接口）
 *  eager:    选中即上传，onChange 立即给到 URL
 *  deferred: 选中只本地预览，需父级提交表单时调 commit() 才上传 */
export const ImageUploadField = React.forwardRef<ImageUploadFieldRef, ImageUploadFieldProps>(
  function ImageUploadField(
    {
      value,
      onChange,
      mode = 'eager',
      uploadPath = '/admin/saas/upload-image',
      fieldName = 'file',
      accept = DEFAULT_ACCEPT,
      maxBytes = DEFAULT_MAX_BYTES,
      hint = 'PNG / WebP / SVG ≤ 10MB',
      className,
      disabled,
      width = 240,
      height = 140,
    },
    ref,
  ) {
    const inputRef = React.useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = React.useState(false)
    const [localFile, setLocalFile] = React.useState<File | null>(null)
    const [localPreview, setLocalPreview] = React.useState<string | null>(null)

    React.useEffect(() => {
      return () => {
        if (localPreview) URL.revokeObjectURL(localPreview)
      }
    }, [localPreview])

    const uploadFile = async (file: File): Promise<string> => {
      const fd = new FormData()
      fd.append(fieldName, file)
      const res = await adminFormPost<{ url: string }>(uploadPath, fd)
      return res.url
    }

    React.useImperativeHandle(ref, () => ({
      async commit() {
        if (mode !== 'deferred') return value ?? null
        if (!localFile) return value ?? null
        setUploading(true)
        try {
          const url = await uploadFile(localFile)
          onChange(url)
          setLocalFile(null)
          if (localPreview) URL.revokeObjectURL(localPreview)
          setLocalPreview(null)
          return url
        } finally {
          setUploading(false)
        }
      },
      isPending: () => mode === 'deferred' && localFile !== null,
    }))

    const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      if (file.size > maxBytes) {
        toast.error(`文件超过 ${(maxBytes / (1024 * 1024)).toFixed(0)} MB`)
        return
      }
      const preview = URL.createObjectURL(file)
      setLocalFile(file)
      if (localPreview) URL.revokeObjectURL(localPreview)
      setLocalPreview(preview)
      if (mode === 'eager') {
        setUploading(true)
        try {
          const url = await uploadFile(file)
          onChange(url)
          setLocalFile(null)
          URL.revokeObjectURL(preview)
          setLocalPreview(null)
        } catch (err) {
          toast.error((err as Error).message || '上传失败')
        } finally {
          setUploading(false)
        }
      }
    }

    const clear = () => {
      setLocalFile(null)
      if (localPreview) URL.revokeObjectURL(localPreview)
      setLocalPreview(null)
      onChange(null)
    }

    const previewUrl = localPreview ?? value ?? null
    const hasContent = !!previewUrl

    return (
      <div className={cn('space-y-2', className)}>
        <div
          className="group relative overflow-hidden rounded-xl border border-dashed border-border bg-muted/20 transition-colors hover:border-primary/40"
          style={{ width, height }}
        >
          {hasContent ? (
            <>
              <img
                src={previewUrl}
                alt="预览"
                className="size-full object-contain"
                draggable={false}
              />
              <div className="absolute inset-0 flex items-end justify-end gap-1 bg-gradient-to-t from-foreground/40 via-transparent to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={disabled || uploading}
                  onClick={() => inputRef.current?.click()}
                >
                  <RotateCcw className="size-3.5" strokeWidth={2.25} />
                  替换
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={disabled || uploading}
                  onClick={clear}
                >
                  <Trash2 className="size-3.5" strokeWidth={2.25} />
                  删除
                </Button>
              </div>
            </>
          ) : (
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
              className="flex size-full cursor-pointer flex-col items-center justify-center gap-2 text-muted-foreground transition-colors hover:text-primary"
            >
              <ImagePlus className="size-7" strokeWidth={2} />
              <span className="text-xs">点击上传</span>
              <span className="text-[10px] text-muted-foreground/80">{hint}</span>
            </button>
          )}

          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/70 backdrop-blur-sm">
              <Loader2 className="size-5 animate-spin text-primary" strokeWidth={2.25} />
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={onPick}
          />
        </div>
        {!hasContent && hint && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
        )}
      </div>
    )
  },
)
