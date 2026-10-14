import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'

/**
 * 后端时间一律为 UTC。若 ISO 串含时间部分（带 'T'）却**没有时区标记**，
 * 一律视为 UTC（补 'Z'），避免被 parseISO / new Date 当成浏览器本地时间从而少 8 小时。
 * 纯日期串（如 2026-06-24）与已带时区（Z / +08:00）的串原样返回。
 *
 * 根因：后端部分接口用裸 model_dump()（非 mode="json"），UtcModel 的
 * when_used="json" 序列化器不触发，datetime 被 FastAPI 编码成不带 tz 的 isoformat。
 * 此处在前端统一兜底，覆盖所有时间展示。
 */
export function normalizeApiTime(dateStr: string): string {
  if (
    typeof dateStr === 'string' &&
    dateStr.includes('T') &&
    !/(?:Z|[+-]\d{2}:?\d{2})$/.test(dateStr)
  ) {
    return `${dateStr}Z`
  }
  return dateStr
}

/** 把后端时间串解析为 Date（无时区标记的按 UTC 处理）。供 toLocaleString 等场景使用。 */
export function parseApiDate(dateStr: string): Date {
  return new Date(normalizeApiTime(dateStr))
}

export function formatDate(dateStr: string, pattern = 'yyyy-MM-dd HH:mm') {
  try {
    return format(parseISO(normalizeApiTime(dateStr)), pattern, { locale: zhCN })
  } catch {
    return dateStr
  }
}

export function formatRelativeTime(dateStr: string) {
  try {
    return formatDistanceToNow(parseISO(normalizeApiTime(dateStr)), {
      addSuffix: true,
      locale: zhCN,
    })
  } catch {
    return dateStr
  }
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
}
