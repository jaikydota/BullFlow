import { uploadsApi } from '@/api/uploads'
import type { ReferenceConfig } from '@/types/generation'
import { IMAGE_DEFAULT_SIZE } from '@/components/generation/SizeSelector'
import type { RefImage } from '@/components/generation/MultiRefImageUpload'

export type GenContentType = 'article' | 'image' | 'video'

/** 三个生成页 +「自动任务」共用的「生成配置」值（受控）。提交/保存时由消费方 resolve 参考图。 */
export type GenerationConfig = {
  prompt: string
  reference: ReferenceConfig
  skillId: string | null
  templateLabel?: string
  // 文章
  modelKey?: string // "provider|model"
  mixed?: boolean
  // 图片
  provider?: string // image/video 共用
  size?: string
  count?: number
  asDynamic?: boolean
  refImages?: RefImage[]
  // 视频
  resolution?: string
  duration?: number
  enableAudio?: boolean
  firstFrame?: RefImage[]
  lastFrame?: RefImage[]
}

/** 按内容类型给出默认配置（生成页初始 state / 自动任务切换类型时复用）。 */
export function defaultGenConfig(type: GenContentType): GenerationConfig {
  const base = { prompt: '', reference: { mode: 'none' } as ReferenceConfig, skillId: null }
  if (type === 'article') return { ...base, modelKey: '', mixed: false }
  if (type === 'image')
    return { ...base, provider: 'azure', size: IMAGE_DEFAULT_SIZE['azure'], count: 1, asDynamic: false, refImages: [] }
  return { ...base, provider: 'doubao', resolution: '720p', duration: 5, enableAudio: true, firstFrame: [], lastFrame: [] }
}

function parseModel(combined: string): { provider: string; model: string } {
  const [provider, ...rest] = (combined || '').split('|')
  return { provider: provider ?? '', model: rest.join('|') }
}

/** 把单条 url 包装成 RefImage（编辑回灌用）。 */
function urlToRef(url: string): RefImage {
  return { key: `lib:${url}`, url, previewUrl: url }
}

async function resolveRefs(items: RefImage[] | undefined): Promise<string[]> {
  if (!items?.length) return []
  return Promise.all(items.map(async (it) => it.url ?? (await uploadsApi.uploadImage(it.file as File)).url))
}

/** 把面板配置序列化成后端 gen_config JSON（resolve 参考图为 url，modelKey 拆 provider+model）。 */
export async function serializeGenConfig(type: GenContentType, cfg: GenerationConfig): Promise<Record<string, unknown>> {
  const common = {
    prompt: cfg.prompt.trim(),
    reference: cfg.reference,
    skill_id: cfg.skillId,
    template_label: cfg.templateLabel,
  }
  if (type === 'article') {
    const { provider, model } = parseModel(cfg.modelKey || '')
    return { ...common, provider: provider || null, model: model || null, mixed: !!cfg.mixed }
  }
  if (type === 'image') {
    const image_urls = await resolveRefs(cfg.refImages)
    return {
      ...common,
      provider: cfg.provider,
      size: cfg.size,
      count: cfg.count ?? 1,
      as_dynamic: !!cfg.asDynamic,
      image_urls,
    }
  }
  // video
  const firstUrls = await resolveRefs(cfg.firstFrame)
  const lastUrls = firstUrls.length ? await resolveRefs(cfg.lastFrame) : []
  return {
    ...common,
    provider: cfg.provider,
    resolution: cfg.resolution,
    duration: cfg.duration,
    enable_audio: cfg.enableAudio !== false,
    image_url: firstUrls[0] ?? null,
    last_image_url: lastUrls[0] ?? null,
  }
}

/** 后端 gen_config JSON → 面板配置（编辑回灌；url 还原成 RefImage）。 */
export function hydrateGenConfig(type: GenContentType, json: Record<string, unknown> | null | undefined): GenerationConfig {
  const j = (json ?? {}) as Record<string, unknown>
  const base: GenerationConfig = {
    prompt: (j.prompt as string) ?? '',
    reference: (j.reference as ReferenceConfig) ?? { mode: 'none' },
    skillId: (j.skill_id as string) ?? null,
    templateLabel: (j.template_label as string) ?? undefined,
  }
  if (type === 'article') {
    const provider = j.provider as string | undefined
    const model = j.model as string | undefined
    return { ...base, modelKey: provider && model ? `${provider}|${model}` : '', mixed: !!j.mixed }
  }
  if (type === 'image') {
    const urls = (j.image_urls as string[] | undefined) ?? []
    return {
      ...base,
      provider: (j.provider as string) ?? 'azure',
      size: (j.size as string) ?? IMAGE_DEFAULT_SIZE['azure'],
      count: (j.count as number) ?? 1,
      asDynamic: !!j.as_dynamic,
      refImages: urls.map(urlToRef),
    }
  }
  const first = j.image_url as string | undefined
  const last = j.last_image_url as string | undefined
  return {
    ...base,
    provider: (j.provider as string) ?? 'doubao',
    resolution: (j.resolution as string) ?? '720p',
    duration: (j.duration as number) ?? 5,
    enableAudio: j.enable_audio !== false,
    firstFrame: first ? [urlToRef(first)] : [],
    lastFrame: last ? [urlToRef(last)] : [],
  }
}
