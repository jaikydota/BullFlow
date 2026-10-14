import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ChevronDown,
  Cpu,
  Globe,
  Layers,
  ShieldCheck,
  TrendingUp,
  Wand2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SUPPORTED_LANGUAGES } from '@/utils/constants'
import { cn } from '@/lib/utils'

const FEATURES = [
  {
    icon: Wand2,
    title: 'AI 巨量内容产线',
    desc: '文章 · 图片 · 视频 · 音频，四模态工业化产出，单人撑起内容矩阵',
    color: 'text-primary',
    ring: 'ring-primary/20',
  },
  {
    icon: Globe,
    title: '全域曝光分发',
    desc: '一次创作自动适配国内外主流社媒，长尾流量持续沉淀转化',
    color: 'text-sky-500',
    ring: 'ring-sky-300/30',
  },
  {
    icon: Layers,
    title: '企业资产沉淀',
    desc: '公司 · 品牌 · 产品 · 客户统一入库，每一次创作都自带品牌基因',
    color: 'text-amber-500',
    ring: 'ring-amber-300/30',
  },
  {
    icon: TrendingUp,
    title: 'AI 自主成交闭环',
    desc: '流量 · 对话 · 转化全程 AI 接管，砍掉销售与人工，长期稳定增收',
    color: 'text-rose-500',
    ring: 'ring-rose-300/30',
  },
]

// 登录页多语言切换：暂时隐藏，后续开放时改为 true 即可
const SHOW_LANGUAGE_SWITCHER = false

interface AuthLayoutProps {
  title?: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  cardSize?: 'sm' | 'md' | 'lg'
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  cardSize = 'md',
}: AuthLayoutProps) {
  const { i18n } = useTranslation()
  const currentLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0]
  // 营销官网地址（.env 中 VITE_WEBSITE_URL 配置）；未配置时不渲染按钮
  const websiteUrl = import.meta.env.VITE_WEBSITE_URL?.trim() || ''

  const cardMax =
    cardSize === 'sm' ? 'max-w-sm' : cardSize === 'lg' ? 'max-w-lg' : 'max-w-md'

  return (
    <div
      className={cn(
        'relative flex h-full min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto',
        // 浅色渐变基底（白 → 浅紫 → 浅粉）
        'bg-[linear-gradient(135deg,oklch(0.99_0.005_285)_0%,oklch(0.96_0.04_290)_45%,oklch(0.95_0.05_25)_100%)]',
        'dark:bg-background',
      )}
    >
      {/* ───── 装饰层：dot 网格 + 5 色光斑慢漂移 ───── */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {/* 网格点阵 */}
        <div
          className="absolute inset-0 opacity-[0.35] dark:opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, oklch(0.55 0.25 285 / 0.18) 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* 上半部高光渐变 */}
        <div className="absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(ellipse_at_top,oklch(1_0_0_/0.6),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_top,oklch(0.5_0.18_285_/0.18),transparent_70%)]" />
        {/* 5 色 blob 慢漂移 */}
        <div className="blob-primary animate-blob absolute -top-40 -left-32 size-[28rem]" />
        <div
          className="blob-rose animate-blob absolute top-1/4 -right-40 size-[24rem]"
          style={{ animationDelay: '6s' }}
        />
        <div
          className="blob-sky animate-blob absolute bottom-[-8rem] left-1/4 size-[22rem]"
          style={{ animationDelay: '12s' }}
        />
        <div
          className="blob-amber animate-blob absolute top-[55%] right-1/3 size-[16rem]"
          style={{ animationDelay: '18s' }}
        />
        <div
          className="blob-emerald animate-blob absolute bottom-1/4 -left-24 size-[18rem]"
          style={{ animationDelay: '24s' }}
        />
      </div>

      {/* 顶部右侧操作：返回官网 + 语言切换 */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 sm:right-8 sm:top-8">
        {websiteUrl && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="glass-soft h-9 cursor-pointer gap-1.5 border-white/40 backdrop-blur-md hover:bg-white/80"
          >
            <a href={websiteUrl}>
              <ArrowLeft className="size-3.5" strokeWidth={2.2} />
              <span>返回官网</span>
            </a>
          </Button>
        )}
        {SHOW_LANGUAGE_SWITCHER && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="glass-soft h-9 cursor-pointer gap-1.5 border-white/40 backdrop-blur-md hover:bg-white/80"
              >
                <span>{currentLang.flag}</span>
                <span className="max-w-[6rem] truncate">{currentLang.label}</span>
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <DropdownMenuItem
                  key={lang.code}
                  onClick={() => void i18n.changeLanguage(lang.code)}
                  className={cn(i18n.language === lang.code && 'bg-accent')}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ───── 左侧介绍 ───── */}
      <div className="relative hidden w-1/2 flex-col justify-between p-12 lg:flex xl:w-[55%] xl:p-16">
        <div className="relative z-10">
          <div className="flex items-center gap-5">
            <img
              src="/logo.png"
              alt="推量牛"
              className="size-36 object-contain"
              draggable={false}
            />
            <span className="text-6xl font-bold tracking-tight">推量牛</span>
          </div>
        </div>

        <div className="relative z-10 max-w-xl space-y-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/60 px-3 py-1 text-xs font-medium text-primary backdrop-blur-md dark:bg-card/60">
              <Wand2 className="size-3.5" />
              推全域流量，擎长效经营
            </div>
            <h1 className="mt-5 text-4xl font-bold leading-[1.15] tracking-tight xl:text-[2.75rem]">
              <span className="text-gradient">AI 巨量内容</span>
              <br />
              × 全域曝光，自主获客与变现
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              AI 替你完成内容生产、流量分发与成交转化的全链路，省下销售与人工成本。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group glass-soft flex items-start gap-3 rounded-xl border border-white/40 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white/85"
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/80 ring-1 transition-transform group-hover:scale-105 dark:bg-card/80',
                    f.color,
                    f.ring,
                  )}
                >
                  <f.icon className="size-[18px]" strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground/90">{f.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {f.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1 backdrop-blur-md dark:bg-card/60">
              <ShieldCheck className="size-3.5 text-emerald-500" />
              企业级多租户隔离
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1 backdrop-blur-md dark:bg-card/60">
              <Cpu className="size-3.5 text-primary" />
              覆盖国内外主流社媒平台
            </span>
          </div>
        </div>

        <p className="relative z-10 text-xs text-muted-foreground">
          © {new Date().getFullYear()} 推量牛 · 全域 AI 流量经营平台
        </p>
      </div>

      {/* ───── 右侧表单卡片 ───── */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className={cn('relative w-full', cardMax)}>
          {/* 卡片外圈柔光晕 */}
          <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-primary/15 via-pink-300/10 to-sky-300/10 blur-2xl" />

          <div className="gradient-border glass-strong overflow-hidden rounded-2xl p-8 shadow-[0_24px_60px_-20px_oklch(0.55_0.25_285_/_0.22)]">
            {/* 移动端品牌 */}
            <div className="mb-6 flex flex-col items-center text-center lg:hidden">
              <img
                src="/logo.png"
                alt="推量牛"
                className="size-16 object-contain"
                draggable={false}
              />
              <p className="mt-4 text-2xl font-bold tracking-tight">推量牛</p>
            </div>

            {(title || subtitle) && (
              <div className="mb-6 hidden lg:block">
                {title && (
                  <h2 className="text-2xl font-bold tracking-tight">
                    <span className="text-gradient">{title}</span>
                  </h2>
                )}
                {subtitle && (
                  <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
                )}
              </div>
            )}

            {children}

            {footer && <div className="mt-6">{footer}</div>}
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground lg:hidden">
            © {new Date().getFullYear()} 推量牛
          </p>
        </div>
      </div>
    </div>
  )
}
