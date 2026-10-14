import { cn } from '@/lib/utils'
import { PLATFORM_LOGOS } from '@/utils/platformLogos'
import { getPlatformByCode, platformToneClass } from '@/utils/tlfPlatforms'

interface PlatformLogoProps {
  code: string
  /** 像素尺寸（宽高一致），默认 16 */
  size?: number
  className?: string
  /** 单色模式：用 currentColor 渲染（深色块/需统一色时），默认用品牌色 */
  mono?: boolean
  /** 无品牌 logo 时是否渲染首字母兜底块（默认 true；false 则什么都不渲染） */
  fallback?: boolean
}

/**
 * 平台品牌 logo —— 国内 / 海外分发平台统一图标。
 * 有品牌 path 的（PLATFORM_LOGOS）渲染品牌色 svg；缺失的（抖音 / 多多视频等）
 * 渲染 tone 色首字母圆角块兜底。爬取与色值见 `@/utils/platformLogos`。
 */
export function PlatformLogo({ code, size = 16, className, mono, fallback = true }: PlatformLogoProps) {
  const logo = PLATFORM_LOGOS[code]
  if (logo) {
    return (
      <svg
        viewBox={logo.vb}
        width={size}
        height={size}
        className={cn('shrink-0', className)}
        role="img"
        aria-hidden
      >
        {logo.paths
          ? logo.paths.map((p, i) => (
              <path key={i} d={p.d} fill={mono ? 'currentColor' : p.fill} />
            ))
          : (logo.d ?? []).map((d, i) => (
              <path key={i} d={d} fill={mono ? 'currentColor' : logo.color} />
            ))}
      </svg>
    )
  }
  if (!fallback) return null
  const name = getPlatformByCode(code)?.name ?? code
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[5px] border font-bold leading-none',
        platformToneClass(code),
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.56) }}
      aria-hidden
    >
      {name.slice(0, 1)}
    </span>
  )
}
