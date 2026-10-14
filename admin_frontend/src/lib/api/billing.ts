import { adminRequest } from '@/lib/api/client'

export type BillingModelType = 'text' | 'image' | 'video' | 'audio' | 'multimodal'
export type BillingMode = 'pay_as_you_go' | 'fixed'

export type PricingMatrixItem = { key: string; label: string; multiplier: number }
export type PricingMatrix = {
  by: 'size' | 'resolution_duration'
  items: PricingMatrixItem[]
}

export type AdminAiModel = {
  id: string
  name: string
  provider: string
  type: BillingModelType
  billingMode: BillingMode
  unitPrice: number
  pricingMatrix?: PricingMatrix | null
  enabled: boolean
}

export type AdminAiModelInput = {
  id?: string | null
  name: string
  provider: string
  type: BillingModelType
  billingMode: BillingMode
  unitPrice: number
  pricingMatrix?: PricingMatrix | null
  enabled: boolean
}

export async function fetchBillingConfig(): Promise<Record<string, unknown>> {
  const data = await adminRequest<{ config: Record<string, unknown> }>('/admin/billing/config')
  return data.config ?? {}
}

export async function listBillingModelsApi(params?: {
  q?: string
  type?: BillingModelType
  enabled?: boolean
}): Promise<{ items: AdminAiModel[]; total: number }> {
  const sp = new URLSearchParams()
  if (params?.q?.trim()) sp.set('q', params.q.trim())
  if (params?.type) sp.set('type', params.type)
  if (typeof params?.enabled === 'boolean') sp.set('enabled', String(params.enabled))
  const qs = sp.toString()
  return adminRequest<{ items: AdminAiModel[]; total: number }>(
    `/admin/billing/models${qs ? `?${qs}` : ''}`,
  )
}

export async function createBillingModelApi(body: AdminAiModelInput): Promise<AdminAiModel> {
  const data = await adminRequest<{ model: AdminAiModel }>('/admin/billing/models', {
    method: 'POST',
    json: body,
  })
  return data.model
}

export async function updateBillingModelApi(
  modelId: string,
  body: AdminAiModelInput,
): Promise<AdminAiModel> {
  const { id: _omit, ...rest } = body
  const data = await adminRequest<{ model: AdminAiModel }>(
    `/admin/billing/models/${encodeURIComponent(modelId)}`,
    { method: 'PUT', json: rest },
  )
  return data.model
}

export async function deleteBillingModelApi(modelId: string): Promise<{ id: string; removed: boolean }> {
  return adminRequest<{ id: string; removed: boolean }>(
    `/admin/billing/models/${encodeURIComponent(modelId)}`,
    { method: 'DELETE' },
  )
}

export async function updateBillingDistributionApi(distribution: number): Promise<{ distribution: number }> {
  return adminRequest<{ distribution: number }>('/admin/billing/distribution', {
    method: 'PUT',
    json: { distribution },
  })
}

