import { Plus, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type ArrayEditorProps<T> = {
  items: T[]
  onChange: (next: T[]) => void
  /** 渲染单项；update 用于局部更新该 index 的项 */
  renderItem: (item: T, index: number, update: (next: T) => void) => React.ReactNode
  /** 新建空项工厂 */
  newItem: () => T
  addLabel?: string
  maxItems?: number
  className?: string
  /** 当只有一项时是否允许删除（默认 true） */
  allowDeleteLast?: boolean
}

/** 多条目编辑器：管理一组 banner / 通知 / 字段配置等 */
export function ArrayEditor<T>({
  items,
  onChange,
  renderItem,
  newItem,
  addLabel = '添加一项',
  maxItems,
  className,
  allowDeleteLast = true,
}: ArrayEditorProps<T>) {
  const update = (index: number, next: T) => {
    const arr = [...items]
    arr[index] = next
    onChange(arr)
  }
  const remove = (index: number) => {
    const arr = items.filter((_, i) => i !== index)
    onChange(arr)
  }
  const add = () => {
    if (maxItems !== undefined && items.length >= maxItems) return
    onChange([...items, newItem()])
  }
  const canAdd = maxItems === undefined || items.length < maxItems

  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item, index) => (
        <div
          key={index}
          className="relative rounded-xl border border-border bg-muted/20 p-3.5"
        >
          {(allowDeleteLast || items.length > 1) && (
            <button
              type="button"
              onClick={() => remove(index)}
              className="absolute right-2 top-2 flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label="删除该项"
            >
              <Trash2 className="size-3.5" strokeWidth={2.25} />
            </button>
          )}
          <div className="pr-7">{renderItem(item, index, (next) => update(index, next))}</div>
        </div>
      ))}
      {canAdd && (
        <Button
          type="button"
          variant="outline"
          onClick={add}
          className="w-full justify-center border-dashed text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-4" strokeWidth={2.25} />
          {addLabel}
        </Button>
      )}
    </div>
  )
}
