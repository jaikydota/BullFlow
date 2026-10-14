import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { customersApi } from '@/api/customers'
import { Button } from '@/components/common/Button'
import { Drawer } from '@/components/common/Drawer'
import { FormField } from '@/components/form/FormField'
import { Input } from '@/components/common/Input'
import { TextArea } from '@/components/form/TextArea'
import { TagInput } from '@/components/form/TagInput'
import { toast } from '@/components/common/Toast'
import type { Customer, CustomerCreate, CustomerUpdate } from '@/types/customer'
import { ApiError } from '@/types/api'
import { cn } from '@/utils/helpers'

export type CustomerFormProps = {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  initialData?: Customer | null
  className?: string
}

export function CustomerForm({ open, onClose, onSuccess, initialData, className }: CustomerFormProps) {
  const { t } = useTranslation()
  const isEdit = Boolean(initialData?.id)

  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState('')
  const [region, setRegion] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(initialData?.name ?? '')
    setCompanyName(initialData?.company_name ?? '')
    setIndustry(initialData?.industry ?? '')
    setRegion(initialData?.region ?? '')
    setContactEmail(initialData?.contact_email ?? '')
    setContactPhone(initialData?.contact_phone ?? '')
    setDescription(initialData?.description ?? '')
    setTags(initialData?.tags?.filter(Boolean) ?? [])
    setNameError('')
  }, [open, initialData])

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
      // 显式发送所有字段（清空字段用 null）；避免后端 exclude_unset 把清空当成未变更。
      const payload: CustomerCreate = {
        name: trimmed,
        company_name: companyName.trim() || null,
        industry: industry.trim() || null,
        region: region.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        description: description.trim() || null,
        tags: tags.length ? tags : null,
      }
      if (isEdit && initialData) {
        const update: CustomerUpdate = payload
        await customersApi.update(initialData.id, update)
        toast.success(t('knowledge.mgmt.customerUpdated'))
      } else {
        await customersApi.create(payload)
        toast.success(t('knowledge.mgmt.customerCreated'))
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
      title={isEdit ? t('knowledge.mgmt.editCustomer') : t('knowledge.mgmt.createCustomer')}
      width="min(32rem, 100vw)"
      className={className}
    >
      <form className={cn('flex h-full min-h-0 flex-col')} onSubmit={handleSubmit}>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 pt-4">
          <FormField label={t('knowledge.mgmt.fields.name')} required error={nameError}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('knowledge.mgmt.fields.companyName')}>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </FormField>
            <FormField label={t('knowledge.mgmt.fields.industry')}>
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('knowledge.mgmt.fields.region')}>
              <Input value={region} onChange={(e) => setRegion(e.target.value)} />
            </FormField>
            <FormField label={t('knowledge.mgmt.fields.contactEmail')}>
              <Input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                type="email"
              />
            </FormField>
          </div>
          <FormField label={t('knowledge.mgmt.fields.contactPhone')}>
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} type="tel" />
          </FormField>
          <FormField label={t('knowledge.mgmt.fields.description')}>
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
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
