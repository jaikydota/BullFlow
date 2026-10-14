import { setAdminToken } from '@/lib/admin-token'
import { adminRequest } from '@/lib/api/client'

type LoginData = {
  access_token: string
  expires_in: number
  token_type?: string
  user: {
    id: string
    email: string
    nickname?: string | null
    role: string
    status: string
  }
}

export async function loginAdmin(account: string, password: string): Promise<void> {
  const data = await adminRequest<LoginData>('/admin/auth/login', {
    method: 'POST',
    json: { account, password },
  })
  setAdminToken(data.access_token)
}

export async function fetchAdminMe(): Promise<LoginData['user']> {
  return adminRequest<LoginData['user']>('/admin/auth/me', { method: 'GET' })
}
