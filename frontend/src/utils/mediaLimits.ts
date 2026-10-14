/**
 * 各生图模型支持的参考图数量上限（与后端 app/core/media_limits.py 保持一致）。
 *
 * 依据各模型线上文档（Seedream 5.0 ≤14、Nano Banana 2 ≤14、GPT-Image-2 ≤16），
 * 产品侧把图片参考图统一收敛到 8 张，避免过多参考图变慢/变贵，并与对话「挂载素材」(8) 对齐。
 *
 * 视频走「首帧 + 尾帧」语义（最多 2 张、带角色），不在此表，单独在视频页处理。
 */

/** 图片各 provider 参考图上限（当前统一 8，保留 per-provider 以便日后按模型放开） */
export const IMAGE_REF_MAX: Record<string, number> = {
  azure: 8, // GPT-Image-2
  doubao: 8, // Seedream 5.0
  tencent: 8, // Nano Banana 2
}

export const IMAGE_REF_DEFAULT = 8

/** 返回某图片 provider 支持的参考图最大数量。 */
export function imageRefLimit(provider: string | undefined): number {
  return (provider && IMAGE_REF_MAX[provider]) || IMAGE_REF_DEFAULT
}
