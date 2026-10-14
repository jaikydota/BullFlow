import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Building2,
  FileText,
  Globe,
  Mail,
  MapPin,
  Phone,
  Trash2,
} from 'lucide-react'

import { companiesApi } from '@/api/companies'
import { Button } from '@/components/common/Button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FormField } from '@/components/form/FormField'
import { Input } from '@/components/common/Input'
import { TextArea } from '@/components/form/TextArea'
import { toast } from '@/components/common/Toast'
import { PageContainer, PageHeader, SectionCard } from '@/components/shared'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Company, CompanyCreate, CompanyUpdate } from '@/types/company'
import { ApiError } from '@/types/api'

type TabKey = 'basic' | 'contact' | 'intro'

export default function CompanyPage() {
  const { t } = useTranslation()

  const [company, setCompany] = useState<Company | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('basic')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [industry, setIndustry] = useState('')
  const [website, setWebsite] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [address, setAddress] = useState('')
  const [nameError, setNameError] = useState('')

  const fillForm = (c: Company | null) => {
    setName(c?.name ?? '')
    setDescription(c?.description ?? '')
    setIndustry(c?.industry ?? '')
    setWebsite(c?.website ?? '')
    setContactEmail(c?.contact_email ?? '')
    setContactPhone(c?.contact_phone ?? '')
    setAddress(c?.address ?? '')
    setNameError('')
  }

  const load = useCallback(async () => {
    setPageLoading(true)
    try {
      const res = await companiesApi.list({ page: 1, page_size: 1 })
      const first = res.items[0] ?? null
      setCompany(first)
      fillForm(first)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('common.failed')
      toast.error(msg)
    } finally {
      setPageLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError(t('knowledge.mgmt.validation.required'))
      setActiveTab('basic') // 校验失败时回到 basic Tab 让用户看到错误
      return
    }
    setNameError('')
    setSaving(true)
    try {
      const payload: CompanyCreate = {
        name: trimmed,
        description: description.trim() || undefined,
        industry: industry.trim() || undefined,
        website: website.trim() || undefined,
        contact_email: contactEmail.trim() || undefined,
        contact_phone: contactPhone.trim() || undefined,
        address: address.trim() || undefined,
      }
      if (company) {
        const update: CompanyUpdate = payload
        const updated = await companiesApi.update(company.id, update)
        setCompany(updated)
        toast.success(t('knowledge.mgmt.companyUpdated'))
      } else {
        const created = await companiesApi.create(payload)
        setCompany(created)
        toast.success(t('knowledge.mgmt.companyCreated'))
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('common.failed')
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!company) return
    setDeleting(true)
    try {
      await companiesApi.delete(company.id)
      toast.success(t('knowledge.mgmt.companyDeleted'))
      setCompany(null)
      fillForm(null)
      setDeleteOpen(false)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('common.failed')
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PageContainer size="md">
      <PageHeader
        title={t('knowledge.company')}
        description="维护公司基本信息，作为 AI 内容生成的基础上下文"
        icon={Building2}
        iconAccent="info"
        breadcrumbs={[{ label: '资产管理' }, { label: '公司信息' }, { label: t('knowledge.company') }]}
        actions={
          <div className="flex items-center gap-2">
            {company && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                disabled={saving}
              >
                <Trash2 className="size-4" />
                {t('common.delete')}
              </Button>
            )}
            <Button
              type="submit"
              form="company-form"
              variant="primary"
              size="sm"
              loading={saving}
              disabled={pageLoading}
            >
              {t('common.save')}
            </Button>
          </div>
        }
      />

      {pageLoading ? (
        <SectionCard variant="elevated" bodyClassName="p-6">
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 rounded-xl bg-muted shimmer" />
            ))}
          </div>
        </SectionCard>
      ) : (
        <form id="company-form" onSubmit={(e) => void handleSubmit(e)}>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="space-y-4">
            <TabsList>
              <TabsTrigger value="basic">
                <Building2 className="size-3.5" />
                基础信息
              </TabsTrigger>
              <TabsTrigger value="contact">
                <Phone className="size-3.5" />
                联系方式
              </TabsTrigger>
              <TabsTrigger value="intro">
                <FileText className="size-3.5" />
                公司介绍
              </TabsTrigger>
            </TabsList>

            {/* 基础信息 */}
            <TabsContent value="basic">
              <SectionCard
                variant="elevated"
                bodyClassName="p-6 space-y-5"
                icon={Building2}
                iconAccent="info"
                title="基础信息"
                description="公司的核心识别信息"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label={t('knowledge.mgmt.fields.name')} required error={nameError}>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="organization"
                      placeholder="例如：北京示例科技有限公司"
                    />
                  </FormField>
                  <FormField label={t('knowledge.mgmt.fields.industry')}>
                    <Input
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      placeholder="例如：跨境电商 / SaaS / 内容"
                    />
                  </FormField>
                </div>
                <FormField
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <Globe className="size-3.5 text-muted-foreground" />
                      {t('knowledge.mgmt.fields.website')}
                    </span>
                  }
                >
                  <Input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    type="url"
                    placeholder="https://"
                  />
                </FormField>
              </SectionCard>
            </TabsContent>

            {/* 联系方式 */}
            <TabsContent value="contact">
              <SectionCard
                variant="elevated"
                bodyClassName="p-6 space-y-5"
                icon={Phone}
                iconAccent="success"
                title="联系方式"
                description="公司对外联系信息"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="size-3.5 text-muted-foreground" />
                        {t('knowledge.mgmt.fields.contactEmail')}
                      </span>
                    }
                  >
                    <Input
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      type="email"
                      autoComplete="email"
                      placeholder="contact@example.com"
                    />
                  </FormField>
                  <FormField
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="size-3.5 text-muted-foreground" />
                        {t('knowledge.mgmt.fields.contactPhone')}
                      </span>
                    }
                  >
                    <Input
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      type="tel"
                      placeholder="+86 ..."
                    />
                  </FormField>
                </div>
                <FormField
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-3.5 text-muted-foreground" />
                      {t('knowledge.mgmt.fields.address')}
                    </span>
                  }
                >
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="完整办公地址"
                  />
                </FormField>
              </SectionCard>
            </TabsContent>

            {/* 公司介绍 */}
            <TabsContent value="intro">
              <SectionCard
                variant="elevated"
                bodyClassName="p-6 space-y-5"
                icon={FileText}
                iconAccent="primary"
                title="公司介绍"
                description="详细描述，用于 AI 内容生成时的上下文参考"
              >
                <FormField label={t('knowledge.mgmt.fields.description')}>
                  <TextArea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={10}
                    placeholder="公司背景、主营业务、核心优势、文化价值观、目标市场……"
                  />
                </FormField>
              </SectionCard>
            </TabsContent>
          </Tabs>
        </form>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t('knowledge.mgmt.deleteCompanyTitle')}
        message={t('knowledge.mgmt.deleteCompanyMessage', { name: company?.name ?? '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </PageContainer>
  )
}
