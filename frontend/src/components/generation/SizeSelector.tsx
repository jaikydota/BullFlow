import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/helpers'

type ImageOption = { label: string; value: string; ratio: string }

/** Nano Banana 2 (Tencent) — 无最低像素限制 */
const TENCENT_IMAGE_OPTIONS: ImageOption[] = [
  { label: '1920×1080 (16:9)', value: '1920x1080', ratio: '16:9' },
  { label: '1080×1920 (9:16)', value: '1080x1920', ratio: '9:16' },
  { label: '1920×1920 (1:1)', value: '1920x1920', ratio: '1:1' },
]

/**
 * Azure gpt-image-2 — 支持自定义尺寸，约束：边长 16 的倍数 + 最长边 ≤ 3840 + 长宽比 ≤ 3:1 + 像素 65万-829万。
 * 这里给 6 档覆盖社媒营销最常用比例 + 2K 高清；4K 实验性，未纳入预设。
 * 注意：严格 1920×1080 因 1080 非 16 倍数无法使用，16:9 用 2048×1152 替代。
 */
const AZURE_IMAGE_OPTIONS: ImageOption[] = [
  { label: '1024×1024 (1:1)', value: '1024x1024', ratio: '1:1' },
  { label: '1536×1024 (3:2)', value: '1536x1024', ratio: '3:2' },
  { label: '1024×1536 (2:3)', value: '1024x1536', ratio: '2:3' },
  { label: '2048×1152 (16:9 · 2K)', value: '2048x1152', ratio: '16:9' },
  { label: '1152×2048 (9:16 · 2K)', value: '1152x2048', ratio: '9:16' },
  { label: '2048×2048 (1:1 · 2K)', value: '2048x2048', ratio: '1:1' },
]

/**
 * Seedream 5.0 (Doubao) — 最低 3,686,400 像素
 * 2560×1440 = 3,686,400 ✓  1440×2560 = 3,686,400 ✓  1920×1920 = 3,686,400 ✓
 */
const DOUBAO_IMAGE_OPTIONS: ImageOption[] = [
  { label: '2560×1440 (16:9)', value: '2560x1440', ratio: '16:9' },
  { label: '1440×2560 (9:16)', value: '1440x2560', ratio: '9:16' },
  { label: '1920×1920 (1:1)', value: '1920x1920', ratio: '1:1' },
]

/** 各服务商默认选中尺寸（与组件同文件共享，供生成页 import） */
// eslint-disable-next-line react-refresh/only-export-components
export const IMAGE_DEFAULT_SIZE: Record<string, string> = {
  doubao: '2560x1440',
  tencent: '1920x1080',
  azure: '1024x1024',
}

const VIDEO_RESOLUTIONS = ['720p', '1080p'] as const
// Tencent Kling 3.0：API 仅接受枚举固定档位（Kling 历代都是 5/10 为主，3.0 含 15）
const TENCENT_VIDEO_DURATIONS = [5, 10, 15] as const
// Doubao Seedance：prompt 拼 `--duration N` 控制，1-15 任意整数都支持
const DOUBAO_VIDEO_DURATION_MIN = 5
const DOUBAO_VIDEO_DURATION_MAX = 15

export type VideoSizeValue = { resolution: string; duration: number }

export type SizeSelectorProps =
  | { type: 'image'; value: string; provider?: string; onChange: (size: string) => void; className?: string }
  | { type: 'video'; value: VideoSizeValue; provider?: string; onChange: (next: VideoSizeValue) => void; className?: string }

function AspectPreview({ ratio, selected }: { ratio: string; selected?: boolean }) {
  const [w, h] = ratio.split(':').map(Number)
  const max = 44
  const boxW = w >= h ? max : (max * w) / h
  const boxH = w >= h ? (max * h) / w : max
  return (
    // 外层固定 44×44 占位，让不同比例的图形都在统一 slot 内居中对齐
    <div className="flex h-11 w-11 items-center justify-center" aria-hidden>
      <div
        className={cn(
          'rounded-md border',
          selected
            ? 'border-primary/40 bg-gradient-to-br from-primary/20 to-violet-400/20'
            : 'border-border bg-muted',
        )}
        style={{ width: boxW, height: boxH }}
      />
    </div>
  )
}

export function SizeSelector(props: SizeSelectorProps) {
  const { t } = useTranslation()

  if (props.type === 'image') {
    const options =
      props.provider === 'tencent'
        ? TENCENT_IMAGE_OPTIONS
        : props.provider === 'azure'
          ? AZURE_IMAGE_OPTIONS
          : DOUBAO_IMAGE_OPTIONS
    return (
      <fieldset className={cn('space-y-3', props.className)}>
        <legend className="mb-2 text-[13px] font-semibold text-foreground">
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" aria-hidden />
            {t('generation.size', '尺寸')}
          </span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {options.map((opt) => {
            const selected = props.value === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => props.onChange(opt.value)}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-3 rounded-xl border px-3 py-4 text-center transition-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                  selected
                    ? 'border-primary/40 bg-primary/10 shadow-soft'
                    : 'border-border bg-card hover:border-primary/30 hover:bg-muted',
                )}
              >
                <AspectPreview ratio={opt.ratio} selected={selected} />
                <span className={cn('text-xs font-medium', selected ? 'text-primary' : 'text-foreground/80')}>
                  {opt.label}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>
    )
  }

  const v = props.value
  // Doubao 支持 5-15 任意秒，Tencent Kling 仅枚举 5/10/15
  const isDoubao = (props.provider ?? 'doubao') === 'doubao'

  // provider 切换后若当前 duration 不合法，自动 clamp 到合法范围
  // （写在 render 内仅做防御读取，实际同步由父组件 onChange 触发；这里只决定 UI 高亮）
  return (
    <fieldset className={cn('space-y-4', props.className)}>
      <legend className="mb-2 text-[13px] font-semibold text-foreground">
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" aria-hidden />
          {t('generation.videoSettings', '视频设置')}
        </span>
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t('generation.resolution', '分辨率')}
          </p>
          <div className="flex flex-wrap gap-2">
            {VIDEO_RESOLUTIONS.map((r) => {
              const selected = v.resolution === r
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => props.onChange({ ...v, resolution: r })}
                  className={cn(
                    'cursor-pointer rounded-xl border px-4 py-2 text-sm font-semibold transition-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                    selected
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-card text-foreground/80 hover:border-primary/30 hover:bg-muted hover:text-foreground',
                  )}
                >
                  {r}
                </button>
              )
            })}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t('generation.duration', '时长')}
            <span className="ml-1.5 normal-case tracking-normal text-[10.5px] font-normal text-muted-foreground/70">
              {isDoubao ? `（${DOUBAO_VIDEO_DURATION_MIN}-${DOUBAO_VIDEO_DURATION_MAX}s 任选）` : '（固定档位）'}
            </span>
          </p>
          {isDoubao ? (
            // Doubao Seedance：5-15 任意整数 slider + 数字显示
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={DOUBAO_VIDEO_DURATION_MIN}
                max={DOUBAO_VIDEO_DURATION_MAX}
                step={1}
                value={v.duration}
                onChange={(e) => props.onChange({ ...v, duration: Number(e.target.value) })}
                className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              />
              <span className="inline-flex h-8 min-w-[3rem] items-center justify-center rounded-lg border border-primary/30 bg-primary/10 px-2 text-sm font-semibold tabular-nums text-primary">
                {v.duration}s
              </span>
            </div>
          ) : (
            // Tencent Kling：固定 5/10/15 三档按钮
            <div className="flex flex-wrap gap-2">
              {TENCENT_VIDEO_DURATIONS.map((d) => {
                const selected = v.duration === d
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => props.onChange({ ...v, duration: d })}
                    className={cn(
                      'cursor-pointer rounded-xl border px-4 py-2 text-sm font-semibold transition-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                      selected
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border bg-card text-foreground/80 hover:border-primary/30 hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {d}s
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </fieldset>
  )
}
