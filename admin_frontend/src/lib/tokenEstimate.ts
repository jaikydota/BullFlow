/**
 * 粗略估算文本的 token 数（用于 skill 提示词的注入成本提示）。
 * 中日韩字符约 1 token/字，其余按 4 字符/token 估算。仅作量级参考，非精确值。
 */
// CJK 标点(不含全角空格 U+3000)、扩展A、统一表意、兼容表意、半角全角形式。
// 用 RegExp 构造器 + 转义字符串，源码保持纯 ASCII，避免不规则空白字符 lint。
const CJK_RE = new RegExp('[\\u3001-\\u303f\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef]', 'g')

export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0
  const cjk = (text.match(CJK_RE) || []).length
  const rest = text.length - cjk
  return Math.round(cjk + rest / 4)
}

/** 格式化为「~1.2k」/「~860」。 */
export function formatTokens(n: number): string {
  if (n >= 1000) return `~${(n / 1000).toFixed(1)}k tokens`
  return `~${n} tokens`
}
