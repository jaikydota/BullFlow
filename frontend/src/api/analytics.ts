import api from './index'

/** 埋点上报（批量）。失败由调用方静默处理，绝不影响业务。 */
export type TrackEventPayload = {
  event_name: string
  visitor_id: string
  session_id?: string
  page_url?: string
  referrer?: string
  properties?: Record<string, unknown>
  ts?: string
}

export const analyticsApi = {
  trackBatch: (events: TrackEventPayload[]) => api.post('/analytics/track/batch', { events }),
}
