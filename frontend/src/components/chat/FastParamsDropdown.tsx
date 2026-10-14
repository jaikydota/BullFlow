import { ChevronDown, Sliders, Volume2, VolumeX } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  IMAGE_DEFAULT_SIZE,
  IMAGE_PROVIDERS,
  IMAGE_SIZE_OPTIONS,
  VIDEO_DURATIONS,
  VIDEO_PROVIDERS,
  VIDEO_RESOLUTIONS,
  type FastParams,
  type FastType,
} from '@/pages/chat/fastConfig'

export type FastParamsDropdownProps = {
  type: FastType
  params: FastParams
  onChange: (next: FastParams) => void
  disabled?: boolean
  className?: string
}

const IMAGE_PROVIDER_LABEL: Record<string, string> = Object.fromEntries(
  IMAGE_PROVIDERS.map((p) => [p.value, p.label]),
)
const VIDEO_PROVIDER_LABEL: Record<string, string> = Object.fromEntries(
  VIDEO_PROVIDERS.map((p) => [p.value, p.label]),
)

/** 把当前参数 summary 显示到 trigger 上 */
function buildSummary(type: FastType, params: FastParams): string {
  if (type === 'article') return '默认 LLM'
  if (type === 'image') {
    const ratio = IMAGE_SIZE_OPTIONS[params.image.provider]?.find((s) => s.value === params.image.size)?.ratio
      ?? params.image.size
    return `${IMAGE_PROVIDER_LABEL[params.image.provider] ?? params.image.provider} · ${ratio}`
  }
  const v = params.video
  return `${VIDEO_PROVIDER_LABEL[v.provider] ?? v.provider} · ${v.resolution} · ${v.duration}s${v.enable_audio ? ' · 🔊' : ''}`
}

export function FastParamsDropdown({ type, params, onChange, disabled, className }: FastParamsDropdownProps) {
  // 文章无需参数选择，仅占位
  if (type === 'article') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 px-2 text-[11px] text-muted-foreground', className)}>
        <Sliders className="size-3.5" strokeWidth={2.1} aria-hidden />
        默认模型
      </span>
    )
  }

  const summary = buildSummary(type, params)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors',
            'hover:border-primary/30 hover:bg-muted/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
            disabled && 'cursor-not-allowed opacity-60',
            className,
          )}
          aria-label="模型与参数"
        >
          <Sliders className="size-3.5 text-muted-foreground" strokeWidth={2.1} aria-hidden />
          <span className="truncate max-w-[14rem]">{summary}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-[22rem] max-w-[calc(100vw-2rem)] space-y-3 p-3">
        {type === 'image' ? <ImageParamFields params={params} onChange={onChange} disabled={disabled} /> : null}
        {type === 'video' ? <VideoParamFields params={params} onChange={onChange} disabled={disabled} /> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── 图片参数字段 ──────────────────────────────────────

function ImageParamFields({
  params,
  onChange,
  disabled,
}: {
  params: FastParams
  onChange: (next: FastParams) => void
  disabled?: boolean
}) {
  const sizeOptions = IMAGE_SIZE_OPTIONS[params.image.provider] ?? IMAGE_SIZE_OPTIONS.doubao
  return (
    <>
      <FieldRow label="模型">
        <ChipGroup
          options={IMAGE_PROVIDERS}
          value={params.image.provider}
          onChange={(p) =>
            onChange({
              ...params,
              image: {
                ...params.image,
                provider: p as 'doubao' | 'tencent',
                size: IMAGE_DEFAULT_SIZE[p] ?? params.image.size,
              },
            })
          }
          disabled={disabled}
        />
      </FieldRow>
      <FieldRow label="尺寸">
        <ChipGroup
          options={sizeOptions.map((s) => ({ value: s.value, label: s.label }))}
          value={params.image.size}
          onChange={(s) => onChange({ ...params, image: { ...params.image, size: s } })}
          disabled={disabled}
        />
      </FieldRow>
    </>
  )
}

// ─── 视频参数字段 ──────────────────────────────────────

function VideoParamFields({
  params,
  onChange,
  disabled,
}: {
  params: FastParams
  onChange: (next: FastParams) => void
  disabled?: boolean
}) {
  const v = params.video
  return (
    <>
      <FieldRow label="模型">
        <ChipGroup
          options={VIDEO_PROVIDERS}
          value={v.provider}
          onChange={(p) => onChange({ ...params, video: { ...v, provider: p as 'doubao' | 'tencent' } })}
          disabled={disabled}
        />
      </FieldRow>
      <FieldRow label="分辨率">
        <ChipGroup
          options={VIDEO_RESOLUTIONS.map((r) => ({ value: r, label: r }))}
          value={v.resolution}
          onChange={(r) => onChange({ ...params, video: { ...v, resolution: r as '720p' | '1080p' } })}
          disabled={disabled}
        />
      </FieldRow>
      <FieldRow label="时长">
        <ChipGroup
          options={VIDEO_DURATIONS.map((d) => ({ value: String(d), label: `${d}s` }))}
          value={String(v.duration)}
          onChange={(d) => onChange({ ...params, video: { ...v, duration: Number(d) } })}
          disabled={disabled}
        />
      </FieldRow>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {v.enable_audio ? (
            <Volume2 className="size-3.5" strokeWidth={2.1} aria-hidden />
          ) : (
            <VolumeX className="size-3.5" strokeWidth={2.1} aria-hidden />
          )}
          音频
        </span>
        <Switch
          checked={v.enable_audio}
          onCheckedChange={(o) => onChange({ ...params, video: { ...v, enable_audio: o } })}
          disabled={disabled}
          className="h-[18px] w-8 data-[state=checked]:bg-primary"
        />
      </div>
    </>
  )
}

// ─── 共用小组件 ──────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center justify-end">{children}</div>
    </div>
  )
}

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'cursor-pointer whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
              active
                ? 'bg-card text-primary shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
