/**
 * 把生成 provider 代号映射为「用户侧模型名」，隐藏聚合服务商 / 厂商。
 *
 * 产品侧只暴露模型名（如 Nano Banana 2 / Seedream 5.0 / GPT-Image-2），不出现
 * 「腾讯 / 豆包 / Azure / 火山引擎 / 阿里云」等聚合服务商或厂商字样——避免用户误以为
 * 模型出自该聚合商（如腾讯只是 Nano Banana 的聚合服务商）。
 */

/** LLM（文本/对话）provider 代号 → 模型家族名 */
const LLM_PROVIDER_LABEL: Record<string, string> = {
  azure: 'GPT-5.4',
  volcengine: 'Doubao',
  aliyun: 'Qwen',
}

/** 图片生成 provider 代号 → 模型名 */
const IMAGE_PROVIDER_LABEL: Record<string, string> = {
  azure: 'GPT-Image-2',
  doubao: 'Seedream 5.0',
  tencent: 'Nano Banana 2',
}

/** 视频生成 provider 代号 → 模型名 */
const VIDEO_PROVIDER_LABEL: Record<string, string> = {
  doubao: 'Seedance 2.0',
  tencent: 'Kling 3.0',
}

/** LLM provider 代号 → 模型家族名（用于聊天模型分组标题等）。 */
export function llmProviderLabel(provider: string | null | undefined): string {
  if (!provider) return ''
  return LLM_PROVIDER_LABEL[provider] ?? provider
}

/** 按内容类型把 provider 代号映射为模型名（image / video / article）。 */
export function modelLabelByType(
  type: string | null | undefined,
  provider: string | null | undefined,
): string {
  if (!provider) return '—'
  if (type === 'image') return IMAGE_PROVIDER_LABEL[provider] ?? provider
  if (type === 'video') return VIDEO_PROVIDER_LABEL[provider] ?? provider
  if (type === 'article') return LLM_PROVIDER_LABEL[provider] ?? provider
  return provider
}
