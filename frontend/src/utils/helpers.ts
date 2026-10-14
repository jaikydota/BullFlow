import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncate(str: string, length: number) {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

export function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function generateId() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
}

/**
 * 手机号注册时为了规避邮箱 NOT NULL 约束生成的占位邮箱：
 * 格式 `phone+{e164}@matrix365.local`，UI 不应展示此类邮箱。
 */
const PLACEHOLDER_EMAIL_RE = /^phone\+\d+@matrix365\.local$/i
export function isPlaceholderEmail(email?: string | null): boolean {
  if (!email) return false
  return PLACEHOLDER_EMAIL_RE.test(email)
}

/** 格式化手机号显示：把 86xxxxxxxxxxx → +86 138 0013 8000 */
export function formatPhone(phone?: string | null): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('86') && digits.length === 13) {
    const local = digits.slice(2)
    return `+86 ${local.slice(0, 3)} ${local.slice(3, 7)} ${local.slice(7)}`
  }
  return `+${digits}`
}
