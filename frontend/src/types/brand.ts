export interface Brand {
  id: string
  user_id: string
  company_id: string | null
  name: string
  description: string | null
  logo_url: string | null
  brand_color: string | null
  slogan: string | null
  tags: string[] | null
  guidelines: string | null
  is_locked: boolean
  created_at: string
  updated_at: string
}

export interface BrandCreate {
  company_id?: string
  name: string
  description?: string
  logo_url?: string
  brand_color?: string
  slogan?: string
  tags?: string[]
  guidelines?: string
}

export interface BrandUpdate {
  name?: string
  description?: string
  logo_url?: string
  brand_color?: string
  slogan?: string
  tags?: string[]
  guidelines?: string
  is_locked?: boolean
}
