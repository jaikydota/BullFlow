import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/helpers'

export type ProviderChoice = { label: string; value: string }
export type ProviderValue = { provider: string; model?: string }

export type ProviderSelectorProps = {
  type: 'image' | 'video'
  value: ProviderValue
  onChange: (next: ProviderValue) => void
  className?: string
}

const IMAGE_PROVIDERS: ProviderChoice[] = [
  { label: 'GPT-Image-2', value: 'azure' },
  { label: 'Seedream 5.0', value: 'doubao' },
  { label: 'Nano Banana 2', value: 'tencent' },
]

const VIDEO_PROVIDERS: ProviderChoice[] = [
  { label: 'Seedance 2.0', value: 'doubao' },
  { label: 'Kling 3.0', value: 'tencent' },
]

export function ProviderSelector({ type, value, onChange, className }: ProviderSelectorProps) {
  const { t } = useTranslation()
  const list = type === 'image' ? IMAGE_PROVIDERS : VIDEO_PROVIDERS

  return (
    <fieldset className={cn('space-y-2', className)}>
      <legend className="mb-2 text-[13px] font-semibold text-foreground">
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" aria-hidden />
          {t('generation.selectModel', '选择模型')}
        </span>
      </legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={t('generation.selectModel', '选择模型')}>
        {list.map((p) => {
          const selected = value.provider === p.value
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange({ ...value, provider: p.value })}
              className={cn(
                'flex w-full cursor-pointer items-center justify-center rounded-xl border px-4 py-3 text-sm font-medium transition-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                selected
                  ? 'border-primary/40 bg-primary/10 text-primary shadow-soft'
                  : 'border-border bg-card text-foreground/80 hover:border-primary/30 hover:bg-muted hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
