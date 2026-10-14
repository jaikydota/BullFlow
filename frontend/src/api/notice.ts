import api from './index'

export type NoticeAccent =
  | 'primary'
  | 'emerald'
  | 'forest'
  | 'sky'
  | 'ocean'
  | 'sunset'
  | 'berry'
  | 'midnight'

export interface NoticeItem {
  id: string
  text: string
  linkUrl: string | null
  accent: NoticeAccent | null
}

export const noticeApi = {
  list: () => api.get<unknown, { items: NoticeItem[] }>('/notices'),
}
