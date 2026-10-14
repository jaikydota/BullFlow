import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { brandsApi } from '@/api/brands'
import { casesApi } from '@/api/cases'
import { productsApi } from '@/api/products'
import { Button } from '@/components/common/Button'
import { Drawer } from '@/components/common/Drawer'
import { Select } from '@/components/common/Select'
import { FormField } from '@/components/form/FormField'
import { Input } from '@/components/common/Input'
import { TagInput } from '@/components/form/TagInput'
import { RichTextEditor } from '@/components/form/RichTextEditor'
import { toast } from '@/components/common/Toast'
import type { Brand } from '@/types/brand'
import type { KnowledgeCase } from '@/types/case'
import type { KnowledgeCaseCreate, KnowledgeCaseUpdate } from '@/types/case'
import type { Product } from '@/types/product'
import { ApiError } from '@/types/api'
import { cn } from '@/utils/helpers'

export type CaseFormProps = {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  initialData?: KnowledgeCase | null
  className?: string
}

export function CaseForm({ open, onClose, onSuccess, initialData, className }: CaseFormProps) {
  const { t } = useTranslation()
  const isEdit = Boolean(initialData?.id)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [brandId, setBrandId] = useState('')
  const [productId, setProductId] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loadingRefs, setLoadingRefs] = useState(false)
  const [loading, setLoading] = useState(false)
  const [titleError, setTitleError] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(initialData?.title ?? '')
    setDescription(initialData?.description ?? '')
    setCategory(initialData?.category ?? '')
    setBrandId(initialData?.brand_id ?? '')
    setProductId(initialData?.product_id ?? '')
    setTags(initialData?.tags?.filter(Boolean) ?? [])
    setTitleError('')
  }, [open, initialData])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingRefs(true)
    Promise.all([
      brandsApi.list({ page: 1, page_size: 500 }),
      productsApi.list({ page: 1, page_size: 500 }),
    ])
      .then(([br, pr]) => {
        if (!cancelled) {
          setBrands(br.items)
          setProducts(pr.items)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBrands([])
          setProducts([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRefs(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const productOptions = useMemo(() => {
    const list = brandId.length
      ? products.filter((p) => p.brand_id === brandId || p.id === productId)
      : products
    return list.map((p) => ({ value: p.id, label: p.name }))
  }, [products, brandId, productId])

  const brandOptions = brands.map((b) => ({ value: b.id, label: b.name }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setTitleError(t('knowledge.mgmt.validation.required'))
      return
    }
    setTitleError('')
    setLoading(true)
    try {
      // 显式发送所有字段（清空字段用 null）；避免后端 exclude_unset 把清空当成未变更。
      // description 是 RichTextEditor 输出的 HTML，空内容（如 "<p></p>"）也认为是清空。
      const isEmptyHtml = (html: string) => {
        const s = html.replace(/<[^>]*>/g, '').trim()
        return s.length === 0
      }
      const payload: KnowledgeCaseCreate = {
        title: trimmed,
        description: isEmptyHtml(description) ? null : description,
        category: category.trim() || null,
        brand_id: brandId || null,
        product_id: productId || null,
        tags: tags.length ? tags : null,
      }
      if (isEdit && initialData) {
        const update: KnowledgeCaseUpdate = payload
        await casesApi.update(initialData.id, update)
        toast.success(t('knowledge.mgmt.caseUpdated'))
      } else {
        await casesApi.create(payload)
        toast.success(t('knowledge.mgmt.caseCreated'))
      }
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('common.failed')
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? t('knowledge.mgmt.editCase') : t('knowledge.mgmt.createCase')}
      width="min(960px, 100vw)"
      className={cn(className)}
    >
      <form className={cn('flex h-full min-h-0 flex-col')} onSubmit={handleSubmit}>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 pt-4">
          <FormField label={t('knowledge.mgmt.fields.title')} required error={titleError}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <FormField label={t('knowledge.mgmt.fields.description')}>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder={t('knowledge.mgmt.markdownHint')}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('knowledge.mgmt.fields.category')}>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} />
            </FormField>
            <FormField label={t('knowledge.mgmt.fields.brand')}>
              <Select
                value={brandId}
                onChange={(val) => {
                  setBrandId(val)
                  setProductId('')
                }}
                options={brandOptions}
                placeholder={loadingRefs ? t('common.loading') : t('knowledge.mgmt.selectBrand')}
                disabled={loadingRefs}
              />
            </FormField>
          </div>
          <FormField label={t('knowledge.mgmt.fields.product')}>
            <Select
              value={productId}
              onChange={(val) => setProductId(val)}
              options={productOptions}
              placeholder={loadingRefs ? t('common.loading') : t('knowledge.mgmt.selectProduct')}
              disabled={loadingRefs}
            />
          </FormField>
          <FormField label={t('knowledge.mgmt.fields.tags')}>
            <TagInput value={tags} onChange={setTags} placeholder={t('knowledge.mgmt.tagPlaceholder')} />
          </FormField>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-card px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={loading}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Drawer>
  )
}
