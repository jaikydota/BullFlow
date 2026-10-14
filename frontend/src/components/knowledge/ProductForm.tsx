import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { brandsApi } from '@/api/brands'
import { productsApi } from '@/api/products'
import { Button } from '@/components/common/Button'
import { Drawer } from '@/components/common/Drawer'
import { Select } from '@/components/common/Select'
import { FormField } from '@/components/form/FormField'
import { Input } from '@/components/common/Input'
import { TextArea } from '@/components/form/TextArea'
import { TagInput } from '@/components/form/TagInput'
import { MinioImageUpload } from '@/components/form/MinioImageUpload'
import { toast } from '@/components/common/Toast'
import type { Brand } from '@/types/brand'
import type { Product, ProductCreate, ProductUpdate } from '@/types/product'
import { ApiError } from '@/types/api'
import { cn } from '@/utils/helpers'

export type ProductFormProps = {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  initialData?: Product | null
  className?: string
}

export function ProductForm({ open, onClose, onSuccess, initialData, className }: ProductFormProps) {
  const { t } = useTranslation()
  const isEdit = Boolean(initialData?.id)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [features, setFeatures] = useState<string[]>([])
  const [brandId, setBrandId] = useState('')
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [loadingBrands, setLoadingBrands] = useState(false)
  const [loading, setLoading] = useState(false)
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(initialData?.name ?? '')
    setDescription(initialData?.description ?? '')
    setCategory(initialData?.category ?? '')
    setFeatures(initialData?.features?.filter(Boolean) ?? [])
    setBrandId(initialData?.brand_id ?? '')
    setCoverImage(initialData?.cover_image ?? null)
    setTags(initialData?.tags?.filter(Boolean) ?? [])
    setNameError('')
  }, [open, initialData])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingBrands(true)
    brandsApi
      .list({ page: 1, page_size: 500 })
      .then((res) => {
        if (!cancelled) setBrands(res.items)
      })
      .catch(() => {
        if (!cancelled) setBrands([])
      })
      .finally(() => {
        if (!cancelled) setLoadingBrands(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const brandOptions = brands.map((b) => ({ value: b.id, label: b.name }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError(t('knowledge.mgmt.validation.required'))
      return
    }
    setNameError('')
    setLoading(true)
    try {
      // 显式发送所有字段（清空字段用 null）；避免后端 exclude_unset 忽略未变更字段时
      // 把"用户已清空的字段"也当成未变更。
      const payload: ProductCreate = {
        name: trimmed,
        description: description.trim() || null,
        category: category.trim() || null,
        features: features.length ? features : null,
        brand_id: brandId || null,
        cover_image: coverImage ?? null,
        tags: tags.length ? tags : null,
      }
      if (isEdit && initialData) {
        const update: ProductUpdate = payload
        await productsApi.update(initialData.id, update)
        toast.success(t('knowledge.mgmt.productUpdated'))
      } else {
        await productsApi.create(payload)
        toast.success(t('knowledge.mgmt.productCreated'))
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
      title={isEdit ? t('knowledge.mgmt.editProduct') : t('knowledge.mgmt.createProduct')}
      width="min(32rem, 100vw)"
      className={className}
    >
      <form className={cn('flex h-full min-h-0 flex-col')} onSubmit={handleSubmit}>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 pt-4">
          <FormField label={t('knowledge.mgmt.fields.name')} required error={nameError}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label={t('knowledge.mgmt.fields.description')}>
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('knowledge.mgmt.fields.category')} hint={t('knowledge.mgmt.categoryHint', '最长 20 个字符')}>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value.slice(0, 20))}
                maxLength={20}
              />
            </FormField>
            <FormField label={t('knowledge.mgmt.fields.brand')}>
              <Select
                value={brandId}
                onChange={(val) => setBrandId(val)}
                options={brandOptions}
                placeholder={loadingBrands ? t('common.loading') : t('knowledge.mgmt.selectBrand')}
                disabled={loadingBrands}
              />
            </FormField>
          </div>
          <FormField label={t('knowledge.mgmt.fields.coverImage')}>
            <MinioImageUpload value={coverImage} onChange={setCoverImage} />
          </FormField>
          <FormField label={t('knowledge.mgmt.fields.features')}>
            <TagInput value={features} onChange={setFeatures} placeholder={t('knowledge.mgmt.featurePlaceholder')} />
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
