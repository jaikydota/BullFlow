import { cn } from '@/lib/utils'
import { getPlatformByCode, platformToneClass } from '@/utils/tlfPlatforms'
import { PlatformLogo } from './PlatformLogo'

interface PlatformBadgeProps {
  code: string
  size?: 'sm' | 'md'
  className?: string
  /** 是否在名称前显示品牌 logo，默认 true */
  showLogo?: boolean
}

export function PlatformBadge({ code, size = 'sm', className, showLogo = true }: PlatformBadgeProps) {
  const label = getPlatformByCode(code)?.name ?? code
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        platformToneClass(code),
        className,
      )}
    >
      {showLogo && (
        <PlatformLogo code={code} size={size === 'sm' ? 13 : 15} fallback={false} className="-ml-0.5" />
      )}
      {label}
    </span>
  )
}
