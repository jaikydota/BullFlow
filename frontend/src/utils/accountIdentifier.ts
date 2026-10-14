/**
 * 智能识别用户输入是邮箱还是中国大陆手机号。
 *
 * - 含 `@` 视为邮箱（基本邮箱正则）
 * - 全 11 位数字、首位 1 视为手机号
 * - 否则 'invalid'
 */
export type AccountKind = 'email' | 'phone' | 'invalid'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CN_PHONE_RE = /^1[3-9]\d{9}$/

export function identifyAccount(input: string): AccountKind {
  const v = input.trim()
  if (!v) return 'invalid'
  if (v.includes('@')) return EMAIL_RE.test(v) ? 'email' : 'invalid'
  if (CN_PHONE_RE.test(v)) return 'phone'
  return 'invalid'
}
