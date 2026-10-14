import { adminRequest } from '@/lib/api/client'

export type TrafficSecretFromApi = {
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
  isEnabled: boolean
  createdAt: string | null
  updatedAt: string | null
}

export type TrafficSecretUpsertBody = {
  title: string
  icon: string | null
  icon_url: string | null
  description: string | null
  tags: string[]
  rating: number | null
  category: string | null
  source: string | null
  price_status: string | null
  content_markdown: string | null
  url: string
  sort_order: number
  is_enabled: boolean
}

export async function fetchTrafficSecrets(): Promise<TrafficSecretFromApi[]> {
  const data = await adminRequest<{ items: TrafficSecretFromApi[] }>('/admin/traffic-secrets')
  return data.items ?? []
}

export async function createTrafficSecret(
  body: TrafficSecretUpsertBody,
): Promise<TrafficSecretFromApi> {
  const data = await adminRequest<{ item: TrafficSecretFromApi }>('/admin/traffic-secrets', {
    method: 'POST',
    json: body,
  })
  return data.item
}

export async function updateTrafficSecret(
  id: string,
  body: TrafficSecretUpsertBody,
): Promise<TrafficSecretFromApi> {
  const data = await adminRequest<{ item: TrafficSecretFromApi }>(
    `/admin/traffic-secrets/${encodeURIComponent(id)}`,
    { method: 'PUT', json: body },
  )
  return data.item
}

export async function toggleTrafficSecret(
  id: string,
  enabled: boolean,
): Promise<TrafficSecretFromApi> {
  const q = enabled ? '?enabled=true' : '?enabled=false'
  const data = await adminRequest<{ item: TrafficSecretFromApi }>(
    `/admin/traffic-secrets/${encodeURIComponent(id)}/status${q}`,
    { method: 'PATCH' },
  )
  return data.item
}

export async function deleteTrafficSecret(id: string): Promise<void> {
  await adminRequest(`/admin/traffic-secrets/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
