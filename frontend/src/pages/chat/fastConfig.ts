/**
 * 快速模式（一次性生成）配置：类型、参数 default、文章模板列表
 *
 * Agent 模式走 /chat/completions SSE 对话流；快速模式走
 * /generation/{article|image|video} 直接生成，提交后跳转 /generation/library。
 */

// 模板统一从 @/components/generation/templates 取，三生成页与快速模式同源（改模板只改那一处）
import {
  ARTICLE_TEMPLATES,
  IMAGE_TEMPLATES,
  VIDEO_TEMPLATES,
  type GenTemplate,
} from '@/components/generation/templates'

export type FastType = 'article' | 'image' | 'video'

/** 图片提供商 — 与 ProviderSelector IMAGE_PROVIDERS 同步（GPT-Image-2 为默认，置首） */
export const IMAGE_PROVIDERS = [
  { value: 'azure', label: 'GPT-Image-2' },
  { value: 'doubao', label: 'Seedream 5.0' },
  { value: 'tencent', label: 'Nano Banana 2' },
] as const

/** 视频提供商 — 与 ProviderSelector VIDEO_PROVIDERS 同步 */
export const VIDEO_PROVIDERS = [
  { value: 'doubao', label: 'Seedance 2.0' },
  { value: 'tencent', label: 'Kling 3.0' },
] as const

/** 图片尺寸 — 与 SizeSelector 同步 */
export const IMAGE_SIZE_OPTIONS: Record<string, { value: string; label: string; ratio: string }[]> = {
  doubao: [
    { value: '2560x1440', label: '16:9', ratio: '16:9' },
    { value: '1440x2560', label: '9:16', ratio: '9:16' },
    { value: '1920x1920', label: '1:1', ratio: '1:1' },
  ],
  tencent: [
    { value: '1920x1080', label: '16:9', ratio: '16:9' },
    { value: '1080x1920', label: '9:16', ratio: '9:16' },
    { value: '1920x1920', label: '1:1', ratio: '1:1' },
  ],
  azure: [
    { value: '1024x1024', label: '1:1', ratio: '1:1' },
    { value: '1536x1024', label: '3:2', ratio: '3:2' },
    { value: '1024x1536', label: '2:3', ratio: '2:3' },
    { value: '2048x1152', label: '16:9 · 2K', ratio: '16:9' },
    { value: '1152x2048', label: '9:16 · 2K', ratio: '9:16' },
    { value: '2048x2048', label: '1:1 · 2K', ratio: '1:1' },
  ],
}

export const IMAGE_DEFAULT_SIZE: Record<string, string> = {
  doubao: '2560x1440',
  tencent: '1920x1080',
  azure: '1024x1024',
}

/** 视频分辨率 */
export const VIDEO_RESOLUTIONS = ['720p', '1080p'] as const

/** 视频时长（Tencent 仅 5/10/15；Doubao 支持 5-15 任意整数，UI 仍提供枚举档位简化交互） */
export const VIDEO_DURATIONS = [5, 10, 15] as const

export type TemplateItem = GenTemplate
export { ARTICLE_TEMPLATES, IMAGE_TEMPLATES, VIDEO_TEMPLATES }

export const FAST_TEMPLATES: Record<FastType, TemplateItem[]> = {
  article: ARTICLE_TEMPLATES,
  image: IMAGE_TEMPLATES,
  video: VIDEO_TEMPLATES,
}

export type FastArticleParams = {
  /** 模板 label（也用作 template_label 字段） */
  template_label?: string
}

export type FastImageParams = {
  provider: 'doubao' | 'tencent' | 'azure'
  size: string
  image_url?: string
}

export type FastVideoParams = {
  provider: 'doubao' | 'tencent'
  resolution: '720p' | '1080p'
  duration: number
  enable_audio: boolean
  image_url?: string
}

export type FastParams = {
  article: FastArticleParams
  image: FastImageParams
  video: FastVideoParams
}

export const DEFAULT_FAST_PARAMS: FastParams = {
  article: { template_label: '' },
  image: { provider: 'azure', size: '1024x1024' },
  video: { provider: 'doubao', resolution: '720p', duration: 5, enable_audio: true },
}

export const FAST_TYPE_PLACEHOLDER: Record<FastType, string> = {
  article: '描述你想要的文章主题、要点或风格…',
  image: '描述你想要的画面、风格、构图…',
  video: '描述你想要的视频画面、镜头、节奏…',
}
