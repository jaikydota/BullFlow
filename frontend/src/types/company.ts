export interface Company {
  id: string
  user_id: string
  name: string
  description: string | null
  industry: string | null
  website: string | null
  logo: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  extra_info: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface CompanyCreate {
  name: string
  description?: string
  industry?: string
  website?: string
  logo?: string
  contact_email?: string
  contact_phone?: string
  address?: string
  extra_info?: Record<string, unknown>
}

export type CompanyUpdate = Partial<CompanyCreate>
