export type ContentType = 'article' | 'image' | 'video'
export type GenerationStatus = 'pending' | 'generating' | 'completed' | 'failed'
export type PublishStatus = 'draft' | 'ready' | 'published'
/** 内容形态：mixed=图文混编文章 / dynamic=图文分离图片动态 / null=普通 */
export type ContentLayout = 'mixed' | 'dynamic'

export interface GeneratedContent {
  id: string
  user_id: string
  type: ContentType
  title: string | null
  content: string | null
  description?: string | null
  tags?: string[] | null
  file_path: string | null
  /** 多图 URL 列表：图文分离=全部图；图文混编=正文内嵌图 */
  media_urls?: string[] | null
  /** 内容形态标记 */
  layout?: ContentLayout | null
  thumbnail_path: string | null
  prompt: string | null
  model_provider: string | null
  model_name: string | null
  parameters: Record<string, unknown> | null
  status: GenerationStatus
  publish_status: PublishStatus
  error_message: string | null
  created_at: string
  updated_at: string
}

/** 参考内容模式：检索知识库 / 自定义 / 不参考 */
export type ReferenceMode = 'auto' | 'custom' | 'none'

/** 「参考内容」配置：替代旧的 brand_info 文本 */
export interface ReferenceConfig {
  mode: ReferenceMode
  /** 自定义模式下勾选的各维度 ID */
  company_ids?: string[]
  brand_ids?: string[]
  product_ids?: string[]
  customer_ids?: string[]
  case_ids?: string[]
  /** 自定义模式下勾选的文档（最多 2 个完整文档） */
  document_ids?: string[]
}

export interface ArticleGenRequest {
  prompt: string
  provider?: string
  model?: string
  brand_info?: string
  reference?: ReferenceConfig
  /** 所选 skill 池预设 ID */
  skill_id?: string | null
  template_label?: string
  stream?: boolean
  /** 生成图文混编内容（正文内嵌配图，走异步生成） */
  mixed?: boolean
}

export interface ImageGenRequest {
  prompt: string
  provider?: string
  size?: string
  /** 单张参考图（兼容旧调用） */
  image_url?: string
  /** 多张参考图 URL（优先于 image_url），后端按各模型上限裁剪 */
  image_urls?: string[]
  brand_info?: string
  reference?: ReferenceConfig
  skill_id?: string | null
  template_label?: string
  title?: string
  /** 一次生成的图片张数（1-9，后端按配置 clamp） */
  count?: number
  /** 生成发布动态：多图 + 基于提示词的文案，复用元数据文案不重复调 LLM */
  as_dynamic?: boolean
}

export interface VideoGenRequest {
  prompt: string
  provider?: string
  resolution?: string
  /** 时长（秒），1-15（模型上限） */
  duration?: number
  /** 是否生成视频背景音/音效，默认 true */
  enable_audio?: boolean
  /** 首帧参考图 */
  image_url?: string
  /** 尾帧参考图（可选，须与首帧同时给） */
  last_image_url?: string
  brand_info?: string
  reference?: ReferenceConfig
  skill_id?: string | null
  template_label?: string
  title?: string
}

/** Initial response from POST /generation/video. */
export interface VideoGenCreateResponse {
  id: string
  status: string
  message?: string
}
