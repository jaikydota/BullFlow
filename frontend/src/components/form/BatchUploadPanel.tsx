import { useState } from 'react'
import { CheckCircle2, FileWarning, Loader2, RotateCcw, XCircle } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { toast } from '@/components/common/Toast'
import { FileUpload, type FileUploadProps } from '@/components/form/FileUpload'
import { ApiError } from '@/types/api'
import { cn } from '@/lib/utils'

type ItemStatus = 'queued' | 'uploading' | 'success' | 'error'

export type BatchUploadPanelProps = {
  accept: FileUploadProps['accept']
  maxSize?: number
  hint?: string
  /** 单次最多文件数，默认 20 */
  maxFiles?: number
  /**
   * 并发上传数，默认 3。每个文件单独发起一次请求，
   * 因此单个 HTTP 请求体最大 = 单文件大小（远小于 nginx 500M 限制），
   * 多文件天然被拆成多次接口调用，不会触达上限。
   */
  concurrency?: number
  /** 单文件上传实现（各页面注入对应 API） */
  uploadOne: (file: File) => Promise<unknown>
  /** 有任意文件成功后调用（用于刷新列表） */
  onUploaded?: (successCount: number) => void
  /** 全部成功后调用（用于关闭弹窗） */
  onClose?: () => void
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function StatusIcon({ status }: { status: ItemStatus }) {
  switch (status) {
    case 'uploading':
      return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
    case 'success':
      return <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
    case 'error':
      return <XCircle className="size-4 shrink-0 text-destructive" />
    default:
      return <FileWarning className="size-4 shrink-0 text-muted-foreground/60" />
  }
}

/**
 * 批量文件上传面板：支持多选（默认最多 20 个）、限并发逐个调用单文件接口、
 * 实时显示每个文件的上传状态，失败项可单独重试。
 * 各媒体页面把自己的 `xxxApi.upload` 通过 `uploadOne` 注入即可复用。
 */
export function BatchUploadPanel({
  accept,
  maxSize,
  hint,
  maxFiles = 20,
  concurrency = 3,
  uploadOne,
  onUploaded,
  onClose,
}: BatchUploadPanelProps) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const [statuses, setStatuses] = useState<ItemStatus[]>([])
  const [errors, setErrors] = useState<(string | null)[]>([])

  const runBatch = async (targets: number[], currentFiles: File[]) => {
    setUploading(true)
    setDone(false)
    let success = 0
    let cursor = 0
    const worker = async () => {
      while (cursor < targets.length) {
        const idx = targets[cursor++]
        setStatuses((s) => { const n = [...s]; n[idx] = 'uploading'; return n })
        try {
          await uploadOne(currentFiles[idx])
          setStatuses((s) => { const n = [...s]; n[idx] = 'success'; return n })
          setErrors((e) => { const n = [...e]; n[idx] = null; return n })
          success += 1
        } catch (err) {
          const msg = err instanceof ApiError ? err.message : '上传失败'
          setStatuses((s) => { const n = [...s]; n[idx] = 'error'; return n })
          setErrors((e) => { const n = [...e]; n[idx] = msg; return n })
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()),
    )
    setUploading(false)
    setDone(true)
    if (success > 0) onUploaded?.(success)
    const failed = targets.length - success
    if (failed === 0) {
      toast.success(`成功上传 ${success} 个文件`)
      onClose?.()
    } else if (success > 0) {
      toast.error(`${success} 个成功，${failed} 个失败，可重试失败项`)
    } else {
      toast.error('上传失败，请重试')
    }
  }

  const startAll = () => {
    if (files.length === 0) return
    setStatuses(files.map(() => 'queued'))
    setErrors(files.map(() => null))
    void runBatch(files.map((_, i) => i), files)
  }

  const retryFailed = () => {
    const failedIdx = statuses.flatMap((s, i) => (s === 'error' ? [i] : []))
    if (failedIdx.length === 0) return
    setStatuses((s) => { const n = [...s]; failedIdx.forEach((i) => { n[i] = 'queued' }); return n })
    void runBatch(failedIdx, files)
  }

  const finishedCount = statuses.filter((s) => s === 'success' || s === 'error').length
  const hasFailed = done && statuses.some((s) => s === 'error')
  const showList = uploading || done

  return (
    <div className="flex flex-col gap-4">
      {showList ? (
        <ul className="flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto">
          {files.map((file, i) => (
            <li
              key={i}
              className={cn(
                'flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 shadow-sm',
                statuses[i] === 'error' && 'border-destructive/40',
              )}
            >
              <StatusIcon status={statuses[i] ?? 'queued'} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {statuses[i] === 'error' && errors[i]
                    ? errors[i]
                    : formatBytes(file.size)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <FileUpload
          accept={accept}
          multiple
          maxSize={maxSize}
          maxFiles={maxFiles}
          hint={hint}
          files={files}
          onFilesChange={setFiles}
        />
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        {!showList && (
          <Button type="button" variant="primary" onClick={startAll} disabled={files.length === 0}>
            开始上传{files.length > 0 ? `（${files.length}）` : ''}
          </Button>
        )}
        {uploading && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在上传 {finishedCount}/{files.length}…
          </span>
        )}
        {done && (
          <>
            {hasFailed && (
              <Button type="button" variant="outline" onClick={retryFailed}>
                <RotateCcw className="size-4" />
                重试失败项
              </Button>
            )}
            <Button type="button" variant="primary" onClick={() => onClose?.()}>
              完成
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
