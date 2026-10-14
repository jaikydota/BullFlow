import * as React from 'react'
import {
  Banknote,
  Building2,
  CreditCard,
  Gift,
  Loader2,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  UserPlus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  PageContainer,
  PageHeader,
  SectionCard,
} from '@/components/shared'
import {
  ArrayEditor,
  ColorPicker,
  GRADIENT_PALETTE,
  ImageUploadField,
  ProForm,
  ProFormField,
  type GradientCode,
} from '@/components/admin'
import {
  fetchAddons,
  fetchPlatformSettings,
  updatePlatformSettings,
  type AdminAddonFromApi,
} from '@/lib/api/saas'
import { ApiBusinessError } from '@/lib/api/schema'

/**
 * 后端 JSON 结构（platform_settings 表的 K-V，对齐 backend defaults）：
 *   {
 *     "system_preferences": {site_name, support_email, platform_logo_url, favicon_url, ...},
 *     "top_banners":        [{id, image_url, link_url, enabled}],
 *     "top_notices":        [{id, text, link_url, accent, enabled}],
 *     "registration_strategy": { welcome_addon_id: <addon-id 或 null> }
 *   }
 * 前端 state 采用 camelCase 并嵌套；mergeFromApi/payloadFromState 负责字段转换。
 */
type SystemPrefs = {
  site_name: string
  support_email: string
  platform_logo_url: string
  favicon_url: string
}

type BannerItem = {
  id: string
  imageUrl: string
  linkUrl: string
  enabled: boolean
}

type NoticeItem = {
  id: string
  text: string
  linkUrl: string
  accent: GradientCode
  enabled: boolean
}

type TransferSettings = {
  enabled: boolean
  companyName: string
  accountName: string
  accountNumber: string
  bankName: string
  bankBranch: string
  remarkTip: string
}

type FinanceSmsSettings = {
  enabled: boolean
  transferNotification: boolean
  invoiceNotification: boolean
}

type PlatformSettings = {
  systemPrefs: SystemPrefs
  topBanners: BannerItem[]
  topNotices: NoticeItem[]
  /** 注册奖励：积分加包 ID，空字符串 = 不赠送 */
  welcomeAddonId: string
  /** 邀请有礼·一阶（注册）奖励加包 ID，空 = 不发 */
  referralRegisterAddonId: string
  /** 邀请有礼·二阶（充值）奖励加包 ID，空 = 不发（前端不展示二阶） */
  referralRechargeAddonId: string
  transferSettings: TransferSettings
  financeSms: FinanceSmsSettings
}

const VALID_ACCENTS = new Set<string>(GRADIENT_PALETTE.map((g) => g.code))

function isGradient(v: unknown): v is GradientCode {
  return typeof v === 'string' && VALID_ACCENTS.has(v)
}

function defaultSettings(): PlatformSettings {
  return {
    systemPrefs: {
      site_name: '推量牛',
      support_email: '',
      platform_logo_url: '',
      favicon_url: '',
    },
    topBanners: [],
    topNotices: [],
    welcomeAddonId: '',
    referralRegisterAddonId: '',
    referralRechargeAddonId: '',
    transferSettings: {
      enabled: false,
      companyName: '',
      accountName: '',
      accountNumber: '',
      bankName: '',
      bankBranch: '',
      remarkTip: '',
    },
    financeSms: {
      enabled: false,
      transferNotification: true,
      invoiceNotification: true,
    },
  }
}

function mergeFromApi(raw: unknown): PlatformSettings {
  const base = defaultSettings()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>

  const sp = (o.system_preferences ?? {}) as Record<string, unknown>
  const tb = Array.isArray(o.top_banners) ? (o.top_banners as Record<string, unknown>[]) : []
  const tn = Array.isArray(o.top_notices) ? (o.top_notices as Record<string, unknown>[]) : []
  const rs = (o.registration_strategy ?? {}) as Record<string, unknown>
  const ts = (o.transfer_settings ?? {}) as Record<string, unknown>
  const fsn = (o.finance_sms_notification ?? {}) as Record<string, unknown>

  const s = (v: unknown, d: string) => (typeof v === 'string' ? v : d)

  return {
    systemPrefs: {
      site_name: s(sp.site_name, base.systemPrefs.site_name),
      support_email: s(sp.support_email, base.systemPrefs.support_email),
      platform_logo_url: s(sp.platform_logo_url, base.systemPrefs.platform_logo_url),
      favicon_url: s(sp.favicon_url, base.systemPrefs.favicon_url),
    },
    topBanners: tb.map((it, idx) => ({
      id: typeof it.id === 'string' && it.id ? it.id : `banner-${Date.now()}-${idx}`,
      imageUrl: s(it.image_url, ''),
      linkUrl: s(it.link_url, ''),
      enabled: Boolean(it.enabled),
    })),
    topNotices: tn.map((it, idx) => ({
      id: typeof it.id === 'string' && it.id ? it.id : `notice-${Date.now()}-${idx}`,
      text: s(it.text, ''),
      linkUrl: s(it.link_url, ''),
      accent: isGradient(it.accent) ? it.accent : 'primary',
      enabled: Boolean(it.enabled),
    })),
    welcomeAddonId: rs.welcome_addon_id ? String(rs.welcome_addon_id) : '',
    referralRegisterAddonId: rs.referral_register_addon_id ? String(rs.referral_register_addon_id) : '',
    referralRechargeAddonId: rs.referral_recharge_addon_id ? String(rs.referral_recharge_addon_id) : '',
    transferSettings: {
      enabled: Boolean(ts.enabled),
      companyName: s(ts.company_name, ''),
      accountName: s(ts.account_name, ''),
      accountNumber: s(ts.account_number, ''),
      bankName: s(ts.bank_name, ''),
      bankBranch: s(ts.bank_branch, ''),
      remarkTip: s(ts.remark_tip, ''),
    },
    financeSms: {
      enabled: Boolean(fsn.enabled),
      transferNotification: fsn.transfer_notification !== false,
      invoiceNotification: fsn.invoice_notification !== false,
    },
  }
}

function payloadFromState(s: PlatformSettings): Record<string, unknown> {
  return {
    system_preferences: {
      site_name: s.systemPrefs.site_name,
      support_email: s.systemPrefs.support_email,
      platform_logo_url: s.systemPrefs.platform_logo_url,
      favicon_url: s.systemPrefs.favicon_url,
    },
    top_banners: s.topBanners.map((b) => ({
      id: b.id,
      image_url: b.imageUrl,
      link_url: b.linkUrl,
      enabled: b.enabled,
    })),
    top_notices: s.topNotices.map((n) => ({
      id: n.id,
      text: n.text,
      link_url: n.linkUrl,
      accent: n.accent,
      enabled: n.enabled,
    })),
    registration_strategy: {
      welcome_addon_id: s.welcomeAddonId || null,
      referral_register_addon_id: s.referralRegisterAddonId || null,
      referral_recharge_addon_id: s.referralRechargeAddonId || null,
    },
    transfer_settings: {
      enabled: s.transferSettings.enabled,
      company_name: s.transferSettings.companyName,
      account_name: s.transferSettings.accountName,
      account_number: s.transferSettings.accountNumber,
      bank_name: s.transferSettings.bankName,
      bank_branch: s.transferSettings.bankBranch,
      remark_tip: s.transferSettings.remarkTip,
    },
    finance_sms_notification: {
      enabled: s.financeSms.enabled,
      transfer_notification: s.financeSms.transferNotification,
      invoice_notification: s.financeSms.invoiceNotification,
    },
  }
}

export default function SettingsPage() {
  const [settings, setSettings] = React.useState<PlatformSettings>(defaultSettings())
  const [baselineJson, setBaselineJson] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [pointsAddons, setPointsAddons] = React.useState<AdminAddonFromApi[]>([])

  const dirty = React.useMemo(
    () => JSON.stringify(settings) !== baselineJson,
    [settings, baselineJson],
  )

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [raw, addons] = await Promise.all([
        fetchPlatformSettings(),
        fetchAddons({ addon_type: 'points' }).catch(() => [] as AdminAddonFromApi[]),
      ])
      const merged = mergeFromApi(raw)
      setSettings(merged)
      setBaselineJson(JSON.stringify(merged))
      setPointsAddons(addons)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('平台配置加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    setSaving(true)
    try {
      const saved = await updatePlatformSettings(payloadFromState(settings))
      const merged = mergeFromApi(saved)
      setSettings(merged)
      setBaselineJson(JSON.stringify(merged))
      toast.success('平台设置已保存')
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const updatePrefs = (patch: Partial<SystemPrefs>) =>
    setSettings((s) => ({ ...s, systemPrefs: { ...s.systemPrefs, ...patch } }))

  const updateTransfer = (patch: Partial<TransferSettings>) =>
    setSettings((s) => ({ ...s, transferSettings: { ...s.transferSettings, ...patch } }))

  const updateFinanceSms = (patch: Partial<FinanceSmsSettings>) =>
    setSettings((s) => ({ ...s, financeSms: { ...s.financeSms, ...patch } }))

  return (
    <PageContainer>
      <PageHeader
        title="平台设置"
        description="品牌信息 / 顶部 Banner / 顶部通知 / 注册策略 / 收费配置入口"
        icon={SettingsIcon}
        iconAccent="primary"
        breadcrumbs={[{ label: '平台运营' }, { label: '平台设置' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} disabled={loading || saving}>
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
              ) : (
                <RefreshCw className="size-3.5" strokeWidth={2.25} />
              )}
              重新加载
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || saving || loading}>
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
              ) : (
                <Save className="size-3.5" strokeWidth={2.25} />
              )}
              保存
            </Button>
          </>
        }
      />

      {dirty && (
        <div className="mb-3 rounded-xl border border-amber-500/35 bg-amber-500/[0.08] px-4 py-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
          您有未保存的更改，请点击右上「保存」同步到服务端
        </div>
      )}

      {loading ? (
        <SectionCard>
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" strokeWidth={2.25} />
            加载配置…
          </div>
        </SectionCard>
      ) : (
        <Tabs defaultValue="platform" className="space-y-4">
          <TabsList>
            <TabsTrigger value="platform" className="gap-2">
              <Building2 className="size-3.5" strokeWidth={2.25} />
              平台信息
            </TabsTrigger>
            <TabsTrigger value="registration" className="gap-2">
              <UserPlus className="size-3.5" strokeWidth={2.25} />
              注册策略
            </TabsTrigger>
            <TabsTrigger value="transfer" className="gap-2">
              <Banknote className="size-3.5" strokeWidth={2.25} />
              对公转账
            </TabsTrigger>
            <TabsTrigger value="billing" className="gap-2">
              <CreditCard className="size-3.5" strokeWidth={2.25} />
              收费配置
            </TabsTrigger>
          </TabsList>

          {/* Platform info */}
          <TabsContent value="platform" className="space-y-4">
            <SectionCard
              title="品牌信息"
              description="站点名称、Logo、支持邮箱等（写入 platform_settings.system_preferences）"
              icon={Building2}
              iconAccent="primary"
            >
              <ProForm layout="2-col">
                <ProFormField label="站点名称" required>
                  <Input
                    value={settings.systemPrefs.site_name}
                    onChange={(e) => updatePrefs({ site_name: e.target.value })}
                    placeholder="推量牛"
                  />
                </ProFormField>
                <ProFormField label="支持邮箱">
                  <Input
                    type="email"
                    value={settings.systemPrefs.support_email}
                    onChange={(e) => updatePrefs({ support_email: e.target.value })}
                    placeholder="support@example.com"
                  />
                </ProFormField>
                <ProFormField label="平台 Logo">
                  <ImageUploadField
                    mode="eager"
                    value={settings.systemPrefs.platform_logo_url}
                    onChange={(url) => updatePrefs({ platform_logo_url: url ?? '' })}
                    width={240}
                    height={140}
                  />
                </ProFormField>
                <ProFormField label="网页 favicon">
                  <ImageUploadField
                    mode="eager"
                    value={settings.systemPrefs.favicon_url}
                    onChange={(url) => updatePrefs({ favicon_url: url ?? '' })}
                    width={120}
                    height={120}
                    hint="ICO / PNG 32×32"
                  />
                </ProFormField>
              </ProForm>
            </SectionCard>

            <SectionCard
              title="顶部 Banner"
              description="C 端首页轮播 banner；按顺序展示已启用项（写入 platform_settings.top_banners）"
              icon={Building2}
              iconAccent="image"
            >
              <ArrayEditor<BannerItem>
                items={settings.topBanners}
                onChange={(topBanners) => setSettings((s) => ({ ...s, topBanners }))}
                newItem={() => ({
                  id: `banner-${Date.now()}`,
                  imageUrl: '',
                  linkUrl: '',
                  enabled: true,
                })}
                addLabel="添加 Banner"
                renderItem={(item, _index, update) => (
                  <ProForm layout="2-col">
                    <ProFormField label="启用">
                      <div className="flex h-9 items-center gap-2">
                        <Switch
                          checked={item.enabled}
                          onCheckedChange={(v) => update({ ...item, enabled: v })}
                        />
                        <span className="text-sm text-muted-foreground">
                          {item.enabled ? '展示' : '隐藏'}
                        </span>
                      </div>
                    </ProFormField>
                    <ProFormField label="跳转链接">
                      <Input
                        value={item.linkUrl}
                        onChange={(e) => update({ ...item, linkUrl: e.target.value })}
                        placeholder="https://…"
                      />
                    </ProFormField>
                    <ProFormField label="Banner 图片" fullWidth>
                      <ImageUploadField
                        mode="eager"
                        value={item.imageUrl}
                        onChange={(url) => update({ ...item, imageUrl: url ?? '' })}
                        width={360}
                        height={120}
                      />
                    </ProFormField>
                  </ProForm>
                )}
              />
            </SectionCard>

            <SectionCard
              title="顶部通知"
              description="C 端通知条；选择渐变色 + 可附跳转链接（写入 platform_settings.top_notices）"
              icon={Building2}
              iconAccent="warning"
            >
              <ArrayEditor<NoticeItem>
                items={settings.topNotices}
                onChange={(topNotices) => setSettings((s) => ({ ...s, topNotices }))}
                newItem={() => ({
                  id: `notice-${Date.now()}`,
                  text: '',
                  linkUrl: '',
                  accent: 'primary' as GradientCode,
                  enabled: true,
                })}
                addLabel="添加通知"
                renderItem={(item, _index, update) => (
                  <ProForm layout="2-col">
                    <ProFormField label="启用">
                      <div className="flex h-9 items-center gap-2">
                        <Switch
                          checked={item.enabled}
                          onCheckedChange={(v) => update({ ...item, enabled: v })}
                        />
                        <span className="text-sm text-muted-foreground">
                          {item.enabled ? '展示' : '隐藏'}
                        </span>
                      </div>
                    </ProFormField>
                    <ProFormField label="跳转链接">
                      <Input
                        value={item.linkUrl}
                        onChange={(e) => update({ ...item, linkUrl: e.target.value })}
                        placeholder="选填"
                      />
                    </ProFormField>
                    <ProFormField label="通知文字" required fullWidth>
                      <Input
                        value={item.text}
                        onChange={(e) => update({ ...item, text: e.target.value })}
                        placeholder="例：周年大促，全场套餐 7 折"
                      />
                    </ProFormField>
                    <ProFormField label="渐变色板" fullWidth>
                      <ColorPicker
                        value={item.accent}
                        onChange={(accent) => update({ ...item, accent })}
                      />
                    </ProFormField>
                  </ProForm>
                )}
              />
            </SectionCard>
          </TabsContent>

          {/* Registration */}
          <TabsContent value="registration" className="space-y-4">
            <SectionCard
              title="新用户注册奖励"
              description="选择一个「积分加包」作为新用户注册时的赠送，永久有效不随订阅周期清零（写入 platform_settings.registration_strategy.welcome_addon_id）"
              icon={UserPlus}
              iconAccent="success"
            >
              <ProForm layout="1-col">
                <ProFormField label="赠送加包" hint="留空则不赠送；保存的是加包 ID，不是 slug">
                  <Select
                    value={settings.welcomeAddonId || '__none__'}
                    onValueChange={(v) =>
                      setSettings((s) => ({
                        ...s,
                        welcomeAddonId: v === '__none__' ? '' : v,
                      }))
                    }
                  >
                    <SelectTrigger className="max-w-md">
                      <SelectValue placeholder="选择一个积分加包…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">不赠送</SelectItem>
                      {pointsAddons.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} · {a.pointsQuota} 积分 · ¥{a.price}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ProFormField>
              </ProForm>
            </SectionCard>

            <SectionCard
              title="邀请有礼奖励"
              description="普通用户邀请好友：好友注册发「一阶奖励」、好友首次充值发「二阶奖励」给邀请人（均为积分加包；二阶留空则 C 端不展示二阶。写入 registration_strategy.referral_register_addon_id / referral_recharge_addon_id）"
              icon={Gift}
              iconAccent="primary"
            >
              <ProForm layout="2-col">
                <ProFormField label="一阶奖励（好友注册）" hint="留空则不发；保存的是加包 ID">
                  <Select
                    value={settings.referralRegisterAddonId || '__none__'}
                    onValueChange={(v) =>
                      setSettings((s) => ({
                        ...s,
                        referralRegisterAddonId: v === '__none__' ? '' : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择一个积分加包…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">不赠送</SelectItem>
                      {pointsAddons.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} · {a.pointsQuota} 积分 · ¥{a.price}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ProFormField>
                <ProFormField label="二阶奖励（好友首次充值）" hint="留空则不发，且 C 端隐藏二阶奖励">
                  <Select
                    value={settings.referralRechargeAddonId || '__none__'}
                    onValueChange={(v) =>
                      setSettings((s) => ({
                        ...s,
                        referralRechargeAddonId: v === '__none__' ? '' : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择一个积分加包…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">不赠送</SelectItem>
                      {pointsAddons.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} · {a.pointsQuota} 积分 · ¥{a.price}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ProFormField>
              </ProForm>
            </SectionCard>
          </TabsContent>

          {/* 对公转账 */}
          <TabsContent value="transfer" className="space-y-4">
            <SectionCard
              title="对公转账收款账户"
              description="启用后用户下单可选「对公转账」并看到以下收款信息；线下转账后提交核销，财务在订单管理确认到账（写入 platform_settings.transfer_settings）"
              icon={Banknote}
              iconAccent="primary"
            >
              <ProForm layout="2-col">
                <ProFormField label="启用对公转账" fullWidth>
                  <div className="flex h-9 items-center gap-2">
                    <Switch
                      checked={settings.transferSettings.enabled}
                      onCheckedChange={(v) => updateTransfer({ enabled: v })}
                    />
                    <span className="text-sm text-muted-foreground">
                      {settings.transferSettings.enabled
                        ? '用户端可选对公转账'
                        : '用户端隐藏对公转账'}
                    </span>
                  </div>
                </ProFormField>
                <ProFormField label="公司名称">
                  <Input
                    value={settings.transferSettings.companyName}
                    onChange={(e) => updateTransfer({ companyName: e.target.value })}
                    placeholder="如 XX 科技有限公司"
                  />
                </ProFormField>
                <ProFormField label="收款户名">
                  <Input
                    value={settings.transferSettings.accountName}
                    onChange={(e) => updateTransfer({ accountName: e.target.value })}
                    placeholder="银行开户名称"
                  />
                </ProFormField>
                <ProFormField label="收款账号">
                  <Input
                    value={settings.transferSettings.accountNumber}
                    onChange={(e) => updateTransfer({ accountNumber: e.target.value })}
                    placeholder="银行账号"
                  />
                </ProFormField>
                <ProFormField label="开户银行">
                  <Input
                    value={settings.transferSettings.bankName}
                    onChange={(e) => updateTransfer({ bankName: e.target.value })}
                    placeholder="如 招商银行"
                  />
                </ProFormField>
                <ProFormField label="开户支行">
                  <Input
                    value={settings.transferSettings.bankBranch}
                    onChange={(e) => updateTransfer({ bankBranch: e.target.value })}
                    placeholder="如 深圳科技园支行"
                  />
                </ProFormField>
                <ProFormField label="转账备注提示" fullWidth>
                  <Input
                    value={settings.transferSettings.remarkTip}
                    onChange={(e) => updateTransfer({ remarkTip: e.target.value })}
                    placeholder="如：请在转账备注填写订单号，便于核销对账"
                  />
                </ProFormField>
              </ProForm>
            </SectionCard>

            <SectionCard
              title="财务短信通知"
              description="用户发起对公转账核销 / 开票申请时，给所有「有手机号的在职财务」发短信提醒上平台审核（写入 platform_settings.finance_sms_notification）"
              icon={Banknote}
              iconAccent="warning"
            >
              <ProForm layout="2-col">
                <ProFormField label="启用财务短信通知" fullWidth>
                  <div className="flex h-9 items-center gap-2">
                    <Switch
                      checked={settings.financeSms.enabled}
                      onCheckedChange={(v) => updateFinanceSms({ enabled: v })}
                    />
                    <span className="text-sm text-muted-foreground">
                      {settings.financeSms.enabled ? '已开启，按下方分项发送' : '已关闭，不发送任何财务短信'}
                    </span>
                  </div>
                </ProFormField>
                <ProFormField label="对公转账提交时通知">
                  <div className="flex h-9 items-center gap-2">
                    <Switch
                      checked={settings.financeSms.transferNotification}
                      onCheckedChange={(v) => updateFinanceSms({ transferNotification: v })}
                      disabled={!settings.financeSms.enabled}
                    />
                    <span className="text-sm text-muted-foreground">用户提交对公核销时发短信</span>
                  </div>
                </ProFormField>
                <ProFormField label="开票申请时通知">
                  <div className="flex h-9 items-center gap-2">
                    <Switch
                      checked={settings.financeSms.invoiceNotification}
                      onCheckedChange={(v) => updateFinanceSms({ invoiceNotification: v })}
                      disabled={!settings.financeSms.enabled}
                    />
                    <span className="text-sm text-muted-foreground">用户申请开票时发短信</span>
                  </div>
                </ProFormField>
              </ProForm>
            </SectionCard>
          </TabsContent>

          {/* Billing redirect */}
          <TabsContent value="billing">
            <SectionCard
              title="收费配置"
              description="完整的 AI 模型计费、资产配额、创作模型配置请到「收费配置」页面"
              icon={CreditCard}
              iconAccent="primary"
              actions={
                <Button asChild>
                  <Link to="/admin/billing">前往收费配置</Link>
                </Button>
              }
            >
              <p className="text-sm leading-relaxed text-muted-foreground">
                AI 模型矩阵、存储库计费、社媒账号绑定单价、分发计费等配置较为复杂，已迁移至独立页面。
              </p>
            </SectionCard>
          </TabsContent>
        </Tabs>
      )}
    </PageContainer>
  )
}
