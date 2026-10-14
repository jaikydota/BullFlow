export interface Customer {
  id: string
  user_id: string
  name: string
  company_name: string | null
  industry: string | null
  region: string | null
  contact_email: string | null
  contact_phone: string | null
  description: string | null
  contact_info: Record<string, unknown> | null
  preferences: Record<string, unknown> | null
  tags: string[] | null
  created_at: string
  updated_at: string
}

export interface CustomerCreate {
  name: string
  company_name?: string | null
  industry?: string | null
  region?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  description?: string | null
  tags?: string[] | null
}

export type CustomerUpdate = Partial<CustomerCreate>
