/** 区域快速筛选（全部 / 国内 / 全球）段控，多处复用：账号管理、添加授权弹窗、发布选平台。
 *  样式为 segmented control（深色底 + 选中实心），与单平台 outline chips 区分。 */
import { Globe } from 'lucide-react'

import { cn } from '@/lib/utils'
import { isOverseaPlatform } from '@/utils/tlfPlatforms'

export type RegionValue = 'all' | 'domestic' | 'oversea'

const REGIONS: { v: RegionValue; label: string }[] = [
  { v: 'all', label: '全部' },
  { v: 'domestic', label: '国内' },
  { v: 'oversea', label: '全球' },
]

/** 平台是否落在某区域筛选内。 */
export function matchRegion(region: RegionValue, code: string): boolean {
  if (region === 'all') return true
  if (region === 'oversea') return isOverseaPlatform(code)
  return !isOverseaPlatform(code)
}

export function RegionTabs({
  value,
  onChange,
  size = 'md',
  disabled = false,
  className,
}: {
  /** 选中的区域；传 null 表示无高亮（如账号管理选中了具体平台时） */
  value: RegionValue | null
  onChange: (v: RegionValue) => void
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-1',
        disabled && 'opacity-50',
        className,
      )}
    >
      {REGIONS.map((r) => (
        <button
          key={r.v}
          type="button"
          disabled={disabled}
          onClick={() => onChange(r.v)}
          className={cn(
            'inline-flex items-center rounded-md font-medium transition-colors',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === r.v
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {r.v === 'oversea' && <Globe className={cn('mr-1', size === 'sm' ? 'size-3' : 'size-3.5')} />}
          {r.label}
        </button>
      ))}
    </div>
  )
}
