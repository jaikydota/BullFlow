import { useCallback, useEffect, useMemo, useState } from 'react'
import { ImageIcon, Loader2, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared'
import { imagesApi } from '@/api/images'
import { toast } from '@/components/common/Toast'
import { cn } from '@/lib/utils'

/** 从媒体库选中的图片：full=原图 URL（喂模型），thumb=缩略图（展示）。 */
export type PickedImage = { id: string; url: string; thumb: string; title?: string }

type LibImage = {
  id: string
  title?: string
  file_name?: string
  file_url?: string
  file_path?: string
  thumbnail_url?: string
  thumbnail_path?: string
}

export type ImageLibraryPickerProps = {
  open: boolean
  onClose: () => void
  onConfirm: (picked: PickedImage[]) => void
  /** 本次最多可再选数量（剩余槽位） */
  max: number
}

const PAGE_SIZE = 30

function fullUrl(img: LibImage): string {
  return img.file_url ?? img.file_path ?? img.thumbnail_url ?? img.thumbnail_path ?? ''
}
function thumbUrl(img: LibImage): string {
  return img.thumbnail_url ?? img.thumbnail_path ?? fullUrl(img)
}

/** 媒体库图片选择器：从「资产管理 - 媒体 - 图片」多选图片作为参考图。 */
export function ImageLibraryPicker({ open, onClose, onConfirm, max }: ImageLibraryPickerProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle className="text-base">从媒体库选择参考图</DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            选择「资产管理 - 媒体 - 图片」中的图片作为参考图，最多再选 {max} 张。
          </DialogDescription>
        </DialogHeader>
        {/* 仅在打开时挂载，确保每次打开都是干净的加载/选择状态 */}
        {open && <PickerBody max={max} onConfirm={onConfirm} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function PickerBody({
  max,
  onConfirm,
  onClose,
}: {
  max: number
  onConfirm: (picked: PickedImage[]) => void
  onClose: () => void
}) {
  const [items, setItems] = useState<LibImage[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    imagesApi
      .list({ page: 1, page_size: PAGE_SIZE })
      .then((res) => { if (!cancelled) setItems(((res.items ?? []) as unknown) as LibImage[]) })
      .catch(() => { if (!cancelled) toast.error('加载图片列表失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((i) => (i.title || i.file_name || '').toLowerCase().includes(needle))
  }, [items, q])

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); return next }
      if (next.size >= max) { toast.error(`最多再选 ${max} 张`); return prev }
      next.add(id)
      return next
    })
  }, [max])

  const confirm = () => {
    const picked: PickedImage[] = items
      .filter((i) => selected.has(i.id))
      .map((i) => ({ id: i.id, url: fullUrl(i), thumb: thumbUrl(i), title: i.title || i.file_name }))
      .filter((p) => p.url)
    onConfirm(picked)
    onClose()
  }

  return (
    <>
      <div className="shrink-0 border-b border-border px-6 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索图片标题…" className="pl-9" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /><span className="ml-2 text-sm">加载中…</span>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={ImageIcon} title="暂无图片" description="去 资产管理 - 媒体 - 图片 上传图片后再来选择" />
        ) : (
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
            {filtered.map((img) => {
              const t = thumbUrl(img)
              const active = selected.has(img.id)
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => toggle(img.id)}
                  className={cn(
                    'group relative aspect-square cursor-pointer overflow-hidden rounded-xl border-2 bg-muted transition-all',
                    active ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/30',
                  )}
                >
                  {t ? (
                    <img src={t} alt={img.title || ''} className="size-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground"><ImageIcon className="size-6" /></div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[11px] text-white">
                    {img.title || img.file_name || '未命名'}
                  </div>
                  {active && (
                    <div className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">✓</div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <DialogFooter className="shrink-0 border-t border-border px-6 py-3">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="button" onClick={confirm} disabled={selected.size === 0}>
          确认{selected.size > 0 ? ` (${selected.size})` : ''}
        </Button>
      </DialogFooter>
    </>
  )
}
