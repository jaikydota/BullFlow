/** Knowledge base case study / reference case */
export interface KnowledgeCase {
  id: string
  user_id: string
  title: string
  description: string | null
  content: string | null
  summary: string | null
  category: string | null
  industry: string | null
  brand_id: string | null
  product_id: string | null
  tags: string[] | null
  cover_image: string | null
  attachments: Record<string, unknown>[] | null
  created_at: string
  updated_at: string
}

export interface KnowledgeCaseCreate {
  title: string
  description?: string | null
  category?: string | null
  brand_id?: string | null
  product_id?: string | null
  tags?: string[] | null
}

export type KnowledgeCaseUpdate = Partial<KnowledgeCaseCreate>
