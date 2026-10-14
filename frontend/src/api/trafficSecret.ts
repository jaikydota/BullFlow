import api from './index'

export interface TrafficSecretItem {
  id: string
  title: string
  icon: string | null
  iconUrl: string | null
  description: string | null
  tags: string[]
  rating: number | null
  category: string | null
  source: string | null
  priceStatus: string | null
  contentMarkdown: string | null
  url: string
  sortOrder: number
}

export const trafficSecretApi = {
  list: () =>
    api.get<unknown, { items: TrafficSecretItem[] }>('/traffic-secrets'),
}
