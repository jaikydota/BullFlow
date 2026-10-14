/**
 * 统一前端埋点入口：`trackEvent(eventName, properties)`。
 *
 * 设计要点：
 * - 未登录也能记录：匿名 `visitor_id` 持久化于 localStorage；
 * - 登录后自动关联 user_id：后端从请求 token 解析（axios 拦截器已带 token），
 *   这里无需显式传 user_id；
 * - 埋点失败绝不影响业务：全程 try/catch 静默 + 队列丢弃；
 * - 批量降频：事件进队列，2s 或满 20 条 flush 一次，减少请求数；
 * - 页面隐藏/卸载时尽力 flush，减少丢点。
 */
import { analyticsApi, type TrackEventPayload } from '@/api/analytics'
import { storage } from '@/utils/storage'
import { generateId } from '@/utils/helpers'

// 事件名常量（与后端 app/core/analytics_events.py 契约一致）
export const EVENTS = {
  PAGE_VIEW: 'page_view',
  REGISTER_SUCCESS: 'register_success',
  LOGIN_SUCCESS: 'login_success',
  ENTER_CREATE_PAGE: 'enter_create_page',
  CREATE_PROJECT: 'create_project',
  GENERATION_START: 'generation_start',
  GENERATION_SUCCESS: 'generation_success',
  GENERATION_FAILED: 'generation_failed',
  EXPORT_START: 'export_start',
  EXPORT_SUCCESS: 'export_success',
  EXPORT_FAILED: 'export_failed',
  VIEW_PRICING: 'view_pricing',
  SELECT_PLAN: 'select_plan',
  PAYMENT_START: 'payment_start',
  PAYMENT_SUCCESS: 'payment_success',
  PAYMENT_FAILED: 'payment_failed',
  QUOTA_EXHAUSTED: 'quota_exhausted',
  UPGRADE_MODAL_SHOWN: 'upgrade_modal_shown',
  UPGRADE_CLICK: 'upgrade_click',
} as const

export type EventName = (typeof EVENTS)[keyof typeof EVENTS]

const VISITOR_KEY = 'visitor_id'
const FLUSH_MS = 2000
const MAX_BATCH = 20

function getVisitorId(): string {
  let v = storage.get<string>(VISITOR_KEY)
  if (!v) {
    v = generateId()
    storage.set(VISITOR_KEY, v)
  }
  return v
}

let queue: TrackEventPayload[] = []
let timer: ReturnType<typeof setTimeout> | null = null

async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (!queue.length) return
  const batch = queue.splice(0, MAX_BATCH)
  try {
    await analyticsApi.trackBatch(batch)
  } catch {
    // 上报失败：直接丢弃，绝不重试到影响业务
  }
  if (queue.length) scheduleFlush()
}

function scheduleFlush(): void {
  if (timer) return
  timer = setTimeout(() => {
    void flush()
  }, FLUSH_MS)
}

/** 统一埋点方法。事件名建议用 EVENTS 常量。 */
export function trackEvent(eventName: EventName | string, properties?: Record<string, unknown>): void {
  try {
    queue.push({
      event_name: eventName,
      visitor_id: getVisitorId(),
      page_url: window.location.pathname + window.location.search,
      referrer: document.referrer || undefined,
      properties: properties && Object.keys(properties).length ? properties : undefined,
      ts: new Date().toISOString(),
    })
    if (queue.length >= MAX_BATCH) {
      void flush()
    } else {
      scheduleFlush()
    }
  } catch {
    // 埋点绝不影响业务
  }
}

// 页面隐藏 / 关闭时尽力 flush（axios 尽力送达；SPA 内导航不触发卸载，队列正常 flush）
if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
  window.addEventListener('pagehide', () => {
    void flush()
  })
}
