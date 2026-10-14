import api from './index'

export type FeedbackCategory = 'suggestion' | 'bug' | 'other'

export interface SubmitFeedbackRequest {
  category: FeedbackCategory
  content: string
  images?: string[]
  contact?: string
}

export interface FeedbackItem {
  id: string
  category: FeedbackCategory
  content: string
  images: string[] | null
  contact: string | null
  status: 'pending' | 'resolved'
  reply: string | null
  replied_at: string | null
  created_at: string
  updated_at: string
}

export interface FeedbackListResult {
  items: FeedbackItem[]
  total: number
  page: number
  page_size: number
  pages: number
}

export const feedbackApi = {
  /** 提交一条反馈 */
  submit: (data: SubmitFeedbackRequest): Promise<FeedbackItem> =>
    api.post<unknown, FeedbackItem>('/feedbacks', data),

  /** 我的反馈历史（含处理状态与回复） */
  list: (page = 1, pageSize = 20): Promise<FeedbackListResult> =>
    api.get<unknown, FeedbackListResult>('/feedbacks', { params: { page, page_size: pageSize } }),
}
