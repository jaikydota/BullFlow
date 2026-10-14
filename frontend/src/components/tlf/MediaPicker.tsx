import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ImageIcon, Loader2, Play, Upload, Video as VideoIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from '@/components/common/Toast'
import { Pagination } from '@/components/common/Pagination'
import { imagesApi } from '@/api/images'
import { videosApi } from '@/api/videos'
import { ApiError } from '@/types/api'
import { cn } from '@/lib/utils'

export type MediaType = 'image' | 'video'

export interface PickedMedia {
  url: string
  thumbnailUrl?: string
  id: string
  type: MediaType
}

interface MediaItemRaw {
  id?: string
  status?: string
  file_path?: string
  thumbnail_path?: string  // image
  cover_path?: string      // video
  title?: string | null
  file_name?: string | null
  duration?: number | null
}

export interface MediaPickerProps {
  open: boolean
  onClose: () => void
  type: MediaType
  /** default false */
  multiple?: boolean
  /** 已有数量 + 即将新增 不能超过此上限；undefined 表示无限制 */
  maxCount?: number
  /** 已选 URLs（重打开时复显） */
  selectedUrls?: string[]
  onConfirm: (picked: PickedMedia[]) => void
  title?: string
}

const PAGE_SIZE = 24

/**
 * 媒体库选择器抽屉（tlf 发布专用）。
 *
 * - 右侧 Sheet，宽 640px
 * - 顶部：标题 + 上传到媒体库按钮（隐藏 file input）
 * - 中部：缩略图网格 + 分页（仅展示 status=completed 的项）
 * - 底部：选中计数 + 取消 / 确认
 * - multiple=false 时单击图片即自动确认关闭
 */
export function MediaPicker({
  open,
  onClose,
  type,
  multiple = false,
  maxCount,
  selectedUrls = [],
  onConfirm,
  title,
}: MediaPickerProps) {
  const [items, setItems] = useState<MediaItemRaw[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedMap, setSelectedMap] = useState<Map<string, PickedMedia>>(new Map())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const api = type === 'image' ? imagesApi : videosApi

  const fetchPage = useCallback(
    async (p: number) => {
      setLoading(true)
      try {
        const data = await api.list({ page: p, page_size: PAGE_SIZE })
        const rawItems = (data.items || []) as MediaItemRaw[]
        // 仅保留已完成、有 file_path 的项
        const usable = rawItems.filter(
          (it) => it.status === 'completed' && !!it.file_path,
        )
        setItems(usable)
        setTotal(data.total || 0)
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : '加载媒体失败')
      } finally {
        setLoading(false)
      }
    },
    [api],
  )

  // 打开时初始化：复显已选 + 加载第一页
  useEffect(() => {
    if (!open) return
    const init = new Map<string, PickedMedia>()
    selectedUrls.forEach((url) => {
      init.set(url, { url, id: url, type })
    })
    setSelectedMap(init)
    setPage(1)
    void fetchPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handlePageChange = (p: number) => {
    setPage(p)
    void fetchPage(p)
  }

  const handleToggle = (item: MediaItemRaw) => {
    if (!item.file_path || !item.id) return
    const url = item.file_path
    setSelectedMap((prev) => {
      const next = new Map(prev)
      if (next.has(url)) {
        next.delete(url)
        return next
      }
      // 达到上限：不允许新增
      if (maxCount !== undefined && next.size >= maxCount) {
        toast.error(`已达到上限 ${maxCount} 项`)
        return prev
      }
      const thumb =
        type === 'image' ? item.thumbnail_path || undefined : item.cover_path || undefined
      next.set(url, { url, thumbnailUrl: thumb, id: item.id!, type })
      // 单选：立即确认关闭
      if (!multiple) {
        const picked = Array.from(next.values())
        onConfirm(picked.slice(-1))
        onClose()
      }
      return next
    })
  }

  const handleConfirm = () => {
    const picked = Array.from(selectedMap.values())
    onConfirm(picked)
    onClose()
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      await api.upload(file)
      toast.success('已上传，处理完成后可在列表中选用')
      // 不轮询；刷新当前页（新上传的暂时是 pending/processing，列表不会出现）
      await fetchPage(page)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '上传失败')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const acceptAttr = type === 'image' ? 'image/*' : 'video/*'
  const reachMax = maxCount !== undefined && selectedMap.size >= maxCount
  const defaultTitle = type === 'image' ? '从媒体库选择图片' : '从媒体库选择视频'

  return (
    <TooltipProvider delayDuration={200}>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="right"
          className="flex w-[640px] max-w-[92vw] flex-col gap-0 p-0 sm:max-w-[640px]"
        >
          {/* Header */}
          <SheetHeader className="shrink-0 space-y-0 border-b px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base">{title || defaultTitle}</SheetTitle>
                <SheetDescription className="mt-0.5 text-xs">
                  {multiple ? '可多选；' : '单选；'}
                  仅显示已处理完成的素材
                  {maxCount !== undefined && ` · 最多 ${maxCount} 项`}
                </SheetDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="cursor-pointer"
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                上传到媒体库
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptAttr}
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleUpload(f)
                }}
              />
            </div>
          </SheetHeader>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="mr-2 size-5 animate-spin" /> 加载中…
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-sm text-muted-foreground">
                {type === 'image' ? (
                  <ImageIcon className="mb-2 size-10 opacity-40" />
                ) : (
                  <VideoIcon className="mb-2 size-10 opacity-40" />
                )}
                媒体库还没有已处理完成的{type === 'image' ? '图片' : '视频'}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 cursor-pointer"
                >
                  上传一个
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {items.map((item) => {
                  const url = item.file_path!
                  const thumb =
                    type === 'image'
                      ? item.thumbnail_path || url
                      : item.cover_path || undefined
                  const selected = selectedMap.has(url)
                  const disabled = !selected && reachMax
                  const card = (
                    <button
                      type="button"
                      onClick={() => !disabled && handleToggle(item)}
                      disabled={disabled}
                      className={cn(
                        'group relative aspect-square w-full cursor-pointer overflow-hidden rounded-lg border bg-muted/40 text-left transition',
                        selected
                          ? 'border-primary ring-2 ring-primary/40'
                          : disabled
                            ? 'cursor-not-allowed opacity-50'
                            : 'border-border hover:border-primary/40',
                      )}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={item.title || item.file_name || ''}
                          className="size-full object-cover"
                          onError={(e) => {
                            ;(e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground">
                          {type === 'image' ? (
                            <ImageIcon className="size-8" />
                          ) : (
                            <VideoIcon className="size-8" />
                          )}
                        </div>
                      )}
                      {type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition group-hover:bg-black/10">
                          <div className="flex size-9 items-center justify-center rounded-full bg-black/60">
                            <Play className="size-4 translate-x-0.5 text-white" />
                          </div>
                        </div>
                      )}
                      {selected && (
                        <div className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-primary text-white shadow">
                          <CheckCircle2 className="size-4" />
                        </div>
                      )}
                      {(item.title || item.file_name) && (
                        <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-[11px] text-white">
                          {item.title || item.file_name}
                        </div>
                      )}
                    </button>
                  )
                  return disabled ? (
                    <Tooltip key={item.id}>
                      <TooltipTrigger asChild>
                        <div>{card}</div>
                      </TooltipTrigger>
                      <TooltipContent>已达到上限</TooltipContent>
                    </Tooltip>
                  ) : (
                    <div key={item.id}>{card}</div>
                  )
                })}
              </div>
            )}

            {/* 分页 */}
            <div className="mt-4 flex justify-center">
              <Pagination
                page={page}
                total={total}
                pageSize={PAGE_SIZE}
                onChange={handlePageChange}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t bg-card px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                已选 {selectedMap.size}
                {maxCount !== undefined && ` / ${maxCount}`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="cursor-pointer"
                >
                  取消
                </Button>
                {multiple && (
                  <Button
                    type="button"
                    onClick={handleConfirm}
                    disabled={selectedMap.size === 0}
                    className="cursor-pointer"
                  >
                    确认（{selectedMap.size}）
                  </Button>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  )
}
