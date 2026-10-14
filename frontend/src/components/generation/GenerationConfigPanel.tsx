import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Images } from 'lucide-react'
import { Select } from '@/components/common/Select'
import { chatApi } from '@/api/chat'
import { imageRefLimit } from '@/utils/mediaLimits'
import { PromptInput } from '@/components/generation/PromptInput'
import { SkillSelector } from '@/components/generation/SkillSelector'
import { ReferenceContentSelector } from '@/components/generation/ReferenceContentSelector'
import { FeatureToggle } from '@/components/generation/FeatureToggle'
import { FieldLabel } from '@/components/generation/FieldLabel'
import { ProviderSelector } from '@/components/generation/ProviderSelector'
import { SizeSelector, IMAGE_DEFAULT_SIZE, type VideoSizeValue } from '@/components/generation/SizeSelector'
import { MultiRefImageUpload } from '@/components/generation/MultiRefImageUpload'
import { ARTICLE_TEMPLATES, IMAGE_TEMPLATES, VIDEO_TEMPLATES } from '@/components/generation/templates'
import type { GenContentType, GenerationConfig } from '@/components/generation/genConfig'

export type GenerationConfigPanelProps = {
  contentType: GenContentType
  value: GenerationConfig
  /** 受控更新（用 useState 的 setter；内部走函数式更新，避免同一事件里多次 set 互相覆盖） */
  onChange: Dispatch<SetStateAction<GenerationConfig>>
  disabled?: boolean
  promptPlaceholder?: string
  className?: string
}

/**
 * 三个生成页 +「自动任务」共用的「生成配置」受控面板。
 * 不含生成按钮、不含预览区、不含轮询——仅负责采集配置。
 */
export function GenerationConfigPanel({ contentType, value, onChange, disabled, promptPlaceholder }: GenerationConfigPanelProps) {
  const { t } = useTranslation()
  // 函数式更新：模板点击会在同一事件里连续 set(prompt) + set(templateLabel)，
  // 用闭包里的旧 value 合并会相互覆盖，必须基于 prev 合并。
  const set = (patch: Partial<GenerationConfig>) => onChange((prev) => ({ ...prev, ...patch }))

  // 文章模型列表（chatApi.listModels）；其它类型用 ProviderSelector，不需要
  const [modelOptions, setModelOptions] = useState<{ value: string; label: string }[]>([])
  const [modelsLoading, setModelsLoading] = useState(contentType === 'article')
  useEffect(() => {
    if (contentType !== 'article') return
    let cancelled = false
    chatApi
      .listModels()
      .then((list) => {
        if (cancelled) return
        const opts = list.map((m) => ({ value: `${m.provider}|${m.model}`, label: m.model }))
        setModelOptions(opts)
        // 未选模型时默认选第一项
        if (!value.modelKey && opts[0]) set({ modelKey: opts[0].value })
      })
      .catch(() => { if (!cancelled) setModelOptions([]) })
      .finally(() => { if (!cancelled) setModelsLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType])

  const templates =
    contentType === 'article' ? ARTICLE_TEMPLATES : contentType === 'image' ? IMAGE_TEMPLATES : VIDEO_TEMPLATES
  const placeholder =
    promptPlaceholder ??
    (contentType === 'article'
      ? t('generation.promptPlaceholder', '描述您需要的文章内容，或从模板中选择…')
      : contentType === 'image'
        ? t('generation.imagePlaceholder', '描述您想要生成的图片画面…')
        : t('generation.videoPlaceholder', '描述您想要生成的视频内容与风格…'))

  return (
    <div className="space-y-5">
      <PromptInput
        value={value.prompt}
        onChange={(v) => set({ prompt: v })}
        onTemplateSelect={(label) => set({ templateLabel: label })}
        templates={templates}
        placeholder={placeholder}
      />

      {/* 文章：图文混编开关 */}
      {contentType === 'article' && (
        <FeatureToggle
          accent="article"
          icon={ImagePlus}
          checked={!!value.mixed}
          onChange={(v) => set({ mixed: v })}
          disabled={disabled}
          label={t('generation.mixedLabel', '生成图文混编内容')}
          hint={t('generation.mixedHint', '让 AI 在正文中自动配图（随机 1–3 张），生成稍慢。')}
        />
      )}

      {/* 图片：发布动态 + 生成数量 */}
      {contentType === 'image' && (
        <>
          <FeatureToggle
            accent="image"
            icon={Images}
            checked={!!value.asDynamic}
            onChange={(v) => set({ asDynamic: v })}
            disabled={disabled}
            label={t('generation.asDynamicLabel', '生成发布动态')}
            hint={t('generation.asDynamicHint', '同步生成发布文案，多图打包成「图文动态」，可直接去发布。')}
          />
          <div className="space-y-1.5">
            <FieldLabel>{t('generation.imageCount', '生成数量')}</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={disabled}
                  onClick={() => set({ count: n })}
                  className={
                    'size-9 cursor-pointer rounded-lg border text-sm font-medium transition-app disabled:cursor-not-allowed disabled:opacity-50 ' +
                    ((value.count ?? 1) === n
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'border-border bg-card text-muted-foreground hover:border-emerald-500/30 hover:text-foreground')
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <SkillSelector value={value.skillId} onChange={(v) => set({ skillId: v })} contentType={contentType} disabled={disabled} />

      <ReferenceContentSelector
        value={value.reference}
        onChange={(v) => set({ reference: v })}
        variant={contentType === 'article' ? 'article' : 'media'}
        disabled={disabled}
      />

      {/* 文章：模型下拉 */}
      {contentType === 'article' && (
        <div className="space-y-1.5">
          <FieldLabel>{t('chat.selectModel', '选择模型')}</FieldLabel>
          {modelsLoading ? (
            <div className="h-10 rounded-xl border border-border bg-muted shimmer" />
          ) : modelOptions.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground/70">{t('chat.noModels', '暂无可用模型')}</p>
          ) : (
            <Select options={modelOptions} value={value.modelKey ?? ''} onChange={(v) => set({ modelKey: v })} />
          )}
        </div>
      )}

      {/* 图片：模型 + 尺寸 + 参考图 */}
      {contentType === 'image' && (
        <>
          <ProviderSelector
            type="image"
            value={{ provider: value.provider ?? 'azure' }}
            onChange={(v) =>
              set({
                provider: v.provider,
                size: IMAGE_DEFAULT_SIZE[v.provider] ?? IMAGE_DEFAULT_SIZE['azure'],
                refImages: (value.refImages ?? []).slice(0, imageRefLimit(v.provider)),
              })
            }
          />
          <SizeSelector type="image" value={value.size ?? IMAGE_DEFAULT_SIZE['azure']} provider={value.provider} onChange={(v) => set({ size: v })} />
          <MultiRefImageUpload
            items={value.refImages ?? []}
            onChange={(v) => set({ refImages: v })}
            max={imageRefLimit(value.provider ?? 'azure')}
            disabled={disabled}
          />
        </>
      )}

      {/* 视频：首尾帧 + 模型 + 尺寸 + 音频 */}
      {contentType === 'video' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MultiRefImageUpload
              label={t('generation.firstFrame', '首帧')}
              items={value.firstFrame ?? []}
              onChange={(arr) => set({ firstFrame: arr, ...(arr.length ? {} : { lastFrame: [] }) })}
              max={1}
              disabled={disabled}
            />
            <MultiRefImageUpload
              label={t('generation.lastFrame', '尾帧')}
              items={value.lastFrame ?? []}
              onChange={(v) => set({ lastFrame: v })}
              max={1}
              disabled={disabled || (value.firstFrame ?? []).length === 0}
            />
          </div>
          <ProviderSelector
            type="video"
            value={{ provider: value.provider ?? 'doubao' }}
            onChange={(v) => {
              const dur = value.duration ?? 5
              const next: Partial<GenerationConfig> = { provider: v.provider }
              // 切到 Tencent 时 duration 必须是 5/10/15 之一，就近归整
              if (v.provider === 'tencent' && ![5, 10, 15].includes(dur)) {
                next.duration = dur < 8 ? 5 : dur < 13 ? 10 : 15
              }
              set(next)
            }}
          />
          <SizeSelector
            type="video"
            value={{ resolution: value.resolution ?? '720p', duration: value.duration ?? 5 } as VideoSizeValue}
            provider={value.provider}
            onChange={(v) => set({ resolution: v.resolution, duration: v.duration })}
          />
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 transition hover:border-rose-500/30">
            <input
              type="checkbox"
              checked={value.enableAudio !== false}
              onChange={(e) => set({ enableAudio: e.target.checked })}
              disabled={disabled}
              className="size-4 cursor-pointer accent-rose-500"
            />
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{t('generation.enableAudio', '生成音频')}</span>
              <span className="text-xs text-muted-foreground">{t('generation.enableAudioHint', '视频自带背景音 / 音效')}</span>
            </div>
          </label>
        </>
      )}
    </div>
  )
}
