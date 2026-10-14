import { useEffect, useMemo, useState } from 'react'
import { Check, MapPin, Search, Send } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RegionSelectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 可选区域（来自 GET /tlf/proxy-regions） */
  regions: string[]
  /** 该用户上次选择的区域（不在 regions 里则视为不可用） */
  lastSelectedRegion: string | null
  /** 「记住选择」初始勾选态（来自全局行为偏好） */
  defaultRemember: boolean
  /** 点「下一步」：region=所选区域，remember=是否记住（写回偏好由父处理） */
  onConfirm: (region: string, remember: boolean) => void
}

/**
 * 扫码绑定前选择代理网络区域：仅提供默认代理的区域选择 + 最近使用 + 记住选择
 * （不区分「默认代理 / 团队代理」分组）。
 */
export function RegionSelectDialog({
  open,
  onOpenChange,
  regions,
  lastSelectedRegion,
  defaultRemember,
  onConfirm,
}: RegionSelectDialogProps) {
  const last = lastSelectedRegion && regions.includes(lastSelectedRegion) ? lastSelectedRegion : null
  const [selected, setSelected] = useState<string>(last ?? '')
  const [remember, setRemember] = useState(defaultRemember)
  const [query, setQuery] = useState('')

  // 每次打开按最新 last / 偏好重置
  useEffect(() => {
    if (open) {
      setSelected(last ?? '')
      setRemember(defaultRemember)
      setQuery('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const shown = useMemo(
    () => regions.filter((r) => r.toLowerCase().includes(query.trim().toLowerCase())),
    [regions, query],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>选择授权账号的网络区域</DialogTitle>
        </DialogHeader>

        <p className="-mt-1 text-xs text-muted-foreground">
          网络区域仅适用于<strong className="text-foreground">国内平台</strong>。
        </p>

        <div className="space-y-4 py-1">
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
              <Send className="size-4" /> 选择网络区域
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索省份或城市"
                className="pl-9"
              />
            </div>
            <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
              {shown.length === 0 ? (
                <p className="w-full py-6 text-center text-sm text-muted-foreground">
                  {regions.length === 0 ? '当前无可用网络区域' : '没有匹配的网络区域'}
                </p>
              ) : (
                shown.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelected(r)}
                    className={cn(
                      'cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors',
                      selected === r
                        ? 'border-primary bg-primary/10 font-medium text-primary'
                        : 'border-border hover:bg-accent',
                    )}
                  >
                    {r}
                  </button>
                ))
              )}
            </div>
          </div>

          {last && (
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">最近使用</p>
              <button
                type="button"
                onClick={() => setSelected(last)}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors',
                  selected === last ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                )}
              >
                <span className="flex items-center gap-2">
                  <MapPin className="size-4 text-primary" />
                  {last}
                </span>
                {selected === last && <Check className="size-4 text-primary" />}
              </button>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <button
            type="button"
            onClick={() => setRemember((v) => !v)}
            className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"
          >
            <span
              className={cn(
                'flex size-4 items-center justify-center rounded border transition-colors',
                remember ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
              )}
            >
              {remember && <Check className="size-3" />}
            </span>
            记住选择，不再提示
          </button>
          <Button
            disabled={!selected}
            onClick={() => onConfirm(selected, remember)}
            className="cursor-pointer"
          >
            下一步
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
