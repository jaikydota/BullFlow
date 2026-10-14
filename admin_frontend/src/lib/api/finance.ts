import { adminRequest } from '@/lib/api/client'

export type FinanceRow = {
  id: string
  nickname: string | null
  email: string | null
  phone: string | null
  status: string
  createdAt: string | null
}

export type FinanceCandidate = {
  id: string
  nickname: string | null
  phoneTail: string | null
  email: string | null
  createdAt: string | null
}

/** 财务团队列表（role=finance） */
export async function fetchFinanceList(search?: string): Promise<FinanceRow[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : ''
  const data = await adminRequest<{ finance: FinanceRow[] }>(`/admin/finance-team${qs}`)
  return data.finance ?? []
}

/** 可设为财务的候选账号（仅普通用户 role=user） */
export async function fetchFinanceCandidates(search?: string): Promise<FinanceCandidate[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : ''
  const data = await adminRequest<{ candidates: FinanceCandidate[] }>(
    `/admin/finance-team/candidates${qs}`,
  )
  return data.candidates ?? []
}

/** 把已有普通用户设为财务 */
export async function promoteFinanceApi(body: { user_id: string }): Promise<FinanceRow> {
  const data = await adminRequest<{ finance: FinanceRow }>('/admin/finance-team/promote', {
    method: 'POST',
    json: body,
  })
  return data.finance
}

/** 撤销财务身份，降回普通用户 */
export async function revokeFinanceApi(userId: string): Promise<{ id: string }> {
  return adminRequest<{ id: string }>(`/admin/finance-team/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })
}
