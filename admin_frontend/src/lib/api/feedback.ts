import { adminRequest } from '@/lib/api/client'

export type FeedbackRow = {
  id: string
  category: 'suggestion' | 'bug' | 'other'
  content: string
  images: string[]
  contact: string | null
  status: 'pending' | 'resolved'
  reply: string | null
  repliedAt: string | null
  createdAt: string | null
  userId: string
  userName: string | null
  userPhoneTail: string | null
  userEmail: string | null
}

export type FeedbackOverview = {
  total: number
  pending: number
  resolved: number
}

export type FeedbackListParams = {
  page: number
  pageSize: number
  status?: string
  category?: string
  search?: string
}

export async function fetchFeedbackOverview(): Promise<FeedbackOverview> {
  return adminRequest<FeedbackOverview>('/admin/feedback/overview')
}

export async function fetchFeedbackList(
  params: FeedbackListParams,
): Promise<{ items: FeedbackRow[]; total: number }> {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('page_size', String(params.pageSize))
  if (params.status) sp.set('status', params.status)
  if (params.category) sp.set('category', params.category)
  if (params.search) sp.set('search', params.search)
  return adminRequest<{ items: FeedbackRow[]; total: number }>(`/admin/feedback?${sp.toString()}`)
}

export async function patchFeedbackApi(
  id: string,
  body: { status?: 'pending' | 'resolved'; reply?: string },
): Promise<FeedbackRow> {
  const data = await adminRequest<{ feedback: FeedbackRow }>(
    `/admin/feedback/${encodeURIComponent(id)}`,
    { method: 'PATCH', json: body },
  )
  return data.feedback
}
