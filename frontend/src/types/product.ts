export interface Product {
  id: string
  user_id: string
  company_id: string | null
  brand_id: string | null
  name: string
  description: string | null
  category: string | null
  features: string[] | null
  specifications: Record<string, unknown> | null
  cover_image: string | null
  price_info: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
}

export interface ProductCreate {
  name: string
  description?: string | null
  category?: string | null
  features?: string[] | null
  specifications?: Record<string, unknown> | null
  cover_image?: string | null
  brand_id?: string | null
  tags?: string[] | null
}

export type ProductUpdate = Partial<ProductCreate>
