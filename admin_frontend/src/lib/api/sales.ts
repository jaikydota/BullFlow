import { adminRequest } from '@/lib/api/client'

export type SalesRow = {
  id: string
  nickname: string | null
  invitationCode: string | null
  email: string | null
  phone: string | null
  status: string
  referredCount: number
  paidCount: number
  revenueYuan: number
  createdAt: string | null
}

export type SalesOverview = {
  summary: { salesTotal: number; referredTotal: number; paidTotal: number; revenueYuan: number }
  topSales: { name: string; count: number }[]
  trend: { date: string; count: number }[]
}

export type SalesReferral = {
  id: string
  nickname: string | null
  phoneTail: string | null
  planSlug: string | null
  paid: boolean
  createdAt: string | null
}

export type SalesUpsertBody = {
  nickname: string
  invitation_code?: string | null
  email?: string | null
  phone?: string | null
  password?: string | null
  status?: 'active' | 'disabled'
}

export async function fetchSalesList(search?: string): Promise<SalesRow[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : ''
  const data = await adminRequest<{ sales: SalesRow[] }>(`/admin/sales${qs}`)
  return data.sales ?? []
}

export async function fetchSalesOverview(): Promise<SalesOverview> {
  return adminRequest<SalesOverview>('/admin/sales/overview')
}

export async function updateSalesApi(
  id: string,
  body: Partial<SalesUpsertBody>,
): Promise<SalesRow> {
  const data = await adminRequest<{ sales: SalesRow }>(`/admin/sales/${encodeURIComponent(id)}`, {
    method: 'PUT',
    json: body,
  })
  return data.sales
}

export type SalesCandidate = {
  id: string
  nickname: string | null
  phoneTail: string | null
  email: string | null
  createdAt: string | null
}

/** 可设为销售的候选账号（仅普通用户 role=user） */
export async function fetchSalesCandidates(search?: string): Promise<SalesCandidate[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : ''
  const data = await adminRequest<{ candidates: SalesCandidate[] }>(`/admin/sales/candidates${qs}`)
  return data.candidates ?? []
}

/** 把已有普通用户设为销售 */
export async function promoteSalesApi(body: {
  user_id: string
  invitation_code?: string | null
}): Promise<SalesRow> {
  const data = await adminRequest<{ sales: SalesRow }>('/admin/sales/promote', {
    method: 'POST',
    json: body,
  })
  return data.sales
}

export async function deleteSalesApi(id: string): Promise<{ id: string }> {
  return adminRequest<{ id: string }>(`/admin/sales/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function fetchSalesReferrals(
  id: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: SalesReferral[]; total: number }> {
  const sp = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  return adminRequest<{ items: SalesReferral[]; total: number }>(
    `/admin/sales/${encodeURIComponent(id)}/referrals?${sp.toString()}`,
  )
}

export type SalesSelf = {
  id: string
  nickname: string | null
  invitationCode: string | null
  email: string | null
  referredCount: number
  paidCount: number
  revenueYuan: number
  trend: { date: string; count: number }[]
}

/** 销售本人自助看板数据 */
export async function fetchSalesMe(): Promise<SalesSelf> {
  return adminRequest<SalesSelf>('/admin/sales/me')
}

/** 销售本人的引流用户列表 */
export async function fetchSalesMeReferrals(
  page = 1,
  pageSize = 50,
): Promise<{ items: SalesReferral[]; total: number }> {
  const sp = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  return adminRequest<{ items: SalesReferral[]; total: number }>(
    `/admin/sales/me/referrals?${sp.toString()}`,
  )
}

/** C 端引流 URL（双域部署配 VITE_FRONTEND_URL；默认 /） */
export function referralUrl(code: string): string {
  const base =
    ((import.meta as { env?: Record<string, string> }).env?.VITE_FRONTEND_URL ?? '/').trim() || '/'
  const origin = base.replace(/\/+$/, '')
  return `${origin}?invitation_code=${encodeURIComponent(code)}`
}
