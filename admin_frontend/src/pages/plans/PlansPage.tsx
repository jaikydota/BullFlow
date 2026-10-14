import * as React from 'react'
import {
  Check,
  Coins,
  CopyCheck,
  CreditCard,
  Globe,
  HardDrive,
  Loader2,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  EmptyState,
  PageContainer,
  PageHeader,
  SectionCard,
} from '@/components/shared'
import {
  ButtonGroup,
  DetailDrawer,
  NumberInput,
  ProForm,
  ProFormField,
  ProFormSection,
} from '@/components/admin'
import { cn } from '@/lib/utils'
import type {
  Plan,
  PlanStatus,
  ValueAddedService,
  VasType,
} from '@/lib/types'
import {
  deleteAddonApi,
  deletePlanApi,
  fetchAddons,
  fetchPlans,
  syncPlanQuotaApi,
  upsertAddonApi,
  upsertPlanApi,
  type AdminAddonFromApi,
  type AdminPlanFromApi,
} from '@/lib/api/saas'
import { ApiBusinessError } from '@/lib/api/schema'

type PlanRow = Plan & { slug: string }
type AddonRow = ValueAddedService & { slug: string }

function mapPlan(p: AdminPlanFromApi): PlanRow {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    monthlyPrice: p.monthlyPrice,
    quarterlyEnabled: !!p.quarterlyEnabled,
    quarterlyPrice: p.quarterlyPrice ?? null,
    yearlyEnabled: !!p.yearlyEnabled,
    yearlyPrice: p.yearlyPrice ?? null,
    status: p.status === 'inactive' ? 'inactive' : 'active',
    tier: Math.max(0, Math.floor(Number(p.tier ?? 0)) || 0),
    pointsQuota: p.pointsQuota,
    storageGB: p.storageGB,
    domesticAccounts: p.domesticAccounts,
    overseasAccounts: p.overseasAccounts,
    features: p.features ?? [],
  }
}

/** 季付 / 年付有效价（自定义价优先，否则按月付 ×3 / ×12） */
function effectiveQuarterly(p: { monthlyPrice: number; quarterlyPrice: number | null }): number {
  return p.quarterlyPrice ?? p.monthlyPrice * 3
}
function effectiveYearly(p: { monthlyPrice: number; yearlyPrice: number | null }): number {
  return p.yearlyPrice ?? p.monthlyPrice * 12
}

function normalizeAddonType(t: string): VasType {
  if (t === 'points' || t === 'storage' || t === 'domestic_account' || t === 'overseas_account')
    return t
  return 'points'
}

function mapAddon(a: AdminAddonFromApi): AddonRow {
  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    type: normalizeAddonType(a.type),
    unit: a.unit,
    price: a.price,
    pointsQuota: Math.max(0, Math.floor(Number(a.pointsQuota ?? 0)) || 0),
    sortOrder: Math.max(0, Math.floor(Number(a.sortOrder ?? 0)) || 0),
    status: a.status === 'inactive' ? 'inactive' : 'active',
  }
}

const addonTypeMeta: Record<VasType, { label: string; icon: typeof Coins; accent: string }> = {
  points: { label: '积分', icon: Coins, accent: 'text-amber-600 dark:text-amber-400' },
  storage: { label: '存储', icon: HardDrive, accent: 'text-blue-600 dark:text-blue-400' },
  domestic_account: {
    label: '国内账号',
    icon: MapPin,
    accent: 'text-emerald-600 dark:text-emerald-400',
  },
  overseas_account: {
    label: '国外账号',
    icon: Globe,
    accent: 'text-violet-600 dark:text-violet-400',
  },
}

/** 各类型增量包的「单份发放数量」展示元数据（字段 label / 单位 / 提示） */
const ADDON_QUOTA_META: Record<VasType, { label: string; suffix: string; unitWord: string; hint: string }> = {
  points: {
    label: '发放积分数',
    suffix: '积分',
    unitWord: '积分',
    hint: '以「永久积分」形式发放到用户增量包余额，不随订阅周期清零',
  },
  storage: {
    label: '发放存储',
    suffix: 'GB',
    unitWord: 'GB',
    hint: '增加用户存储上限（付费套餐期间有效，降级到免费版 / 到期失效）',
  },
  domestic_account: {
    label: '发放国内账号数',
    suffix: '个',
    unitWord: '个国内账号',
    hint: '增加用户国内社媒账号名额（付费套餐期间有效，降级到免费版 / 到期失效）',
  },
  overseas_account: {
    label: '发放国外账号数',
    suffix: '个',
    unitWord: '个国外账号',
    hint: '增加用户国外社媒账号名额（付费套餐期间有效，降级到免费版 / 到期失效）',
  },
}

/** 增量包展示文案：按类型 + 单份发放数量自动生成（增量包为永久额度，无「按月」概念） */
function autoAddonUnit(type: VasType, quota: number): string {
  const n = Math.max(0, Math.floor(Number(quota) || 0))
  return `${n.toLocaleString()} ${ADDON_QUOTA_META[type].unitWord}`
}

export default function PlansPage() {
  const [plans, setPlans] = React.useState<PlanRow[]>([])
  const [services, setServices] = React.useState<AddonRow[]>([])
  const [loading, setLoading] = React.useState(true)

  const [planDrawerOpen, setPlanDrawerOpen] = React.useState(false)
  const [editingPlan, setEditingPlan] = React.useState<PlanRow | null>(null)
  const [editingPlanSlug, setEditingPlanSlug] = React.useState<string | null>(null)
  const [planSaving, setPlanSaving] = React.useState(false)
  const [deletingPlan, setDeletingPlan] = React.useState<PlanRow | null>(null)
  const [convertTarget, setConvertTarget] = React.useState<string>('')
  const [planDeleting, setPlanDeleting] = React.useState(false)
  const [syncingPlan, setSyncingPlan] = React.useState<PlanRow | null>(null)
  const [syncMode, setSyncMode] = React.useState<'upgrade_only' | 'align'>('upgrade_only')
  const [syncBusy, setSyncBusy] = React.useState(false)

  const [addonDrawerOpen, setAddonDrawerOpen] = React.useState(false)
  const [editingAddon, setEditingAddon] = React.useState<AddonRow | null>(null)
  const [editingAddonSlug, setEditingAddonSlug] = React.useState<string | null>(null)
  const [addonSaving, setAddonSaving] = React.useState(false)
  // 积分类增量包的「单位说明」：false=按积分数自动生成只读，true=手动自定义
  const [addonUnitCustom, setAddonUnitCustom] = React.useState(false)
  const [deletingAddon, setDeletingAddon] = React.useState<AddonRow | null>(null)
  const [addonDeleting, setAddonDeleting] = React.useState(false)

  const loadCatalog = React.useCallback(async () => {
    setLoading(true)
    try {
      const [pl, sv] = await Promise.all([fetchPlans(), fetchAddons()])
      setPlans(pl.map(mapPlan))
      setServices(sv.map(mapAddon))
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('套餐与服务列表加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  const planPayload = (row: PlanRow, status?: PlanStatus) => ({
    slug: row.slug.trim(),
    name: row.name.trim(),
    monthly_price_yuan: Math.max(0, Math.floor(Number(row.monthlyPrice)) || 0),
    quarterly_enabled: !!row.quarterlyEnabled,
    // 未启用或留空 → null（后端按月付×3 计算）
    quarterly_price_yuan:
      row.quarterlyEnabled && row.quarterlyPrice != null && Number(row.quarterlyPrice) > 0
        ? Math.floor(Number(row.quarterlyPrice))
        : null,
    yearly_enabled: !!row.yearlyEnabled,
    yearly_price_yuan:
      row.yearlyEnabled && row.yearlyPrice != null && Number(row.yearlyPrice) > 0
        ? Math.floor(Number(row.yearlyPrice))
        : null,
    status: (status ?? row.status) === 'inactive' ? 'inactive' : 'active',
    tier: Math.max(0, Math.floor(Number(row.tier)) || 0),
    points_quota: Math.max(0, Math.floor(Number(row.pointsQuota)) || 0),
    storage_gb: Math.max(0, Math.floor(Number(row.storageGB)) || 0),
    domestic_accounts: Math.max(0, Math.floor(Number(row.domesticAccounts)) || 0),
    overseas_accounts: Math.max(0, Math.floor(Number(row.overseasAccounts)) || 0),
    features: row.features ?? [],
  })

  const togglePlanStatus = async (plan: PlanRow) => {
    const next: PlanStatus = plan.status === 'active' ? 'inactive' : 'active'
    try {
      const saved = await upsertPlanApi(plan.slug, { ...planPayload(plan), status: next })
      const savedRow = mapPlan(saved)
      // 用接口返回值直接替换本地数组对应项，不依赖二次 GET（避免缓存 / 渲染调度问题）
      setPlans((prev) => prev.map((p) => (p.slug === plan.slug ? savedRow : p)))
      toast.success(`套餐「${plan.name}」已${next === 'active' ? '上架' : '下架'}`)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('更新套餐状态失败')
    }
  }

  const openAddPlan = () => {
    setEditingPlanSlug(null)
    setEditingPlan({
      id: '',
      slug: '',
      name: '',
      monthlyPrice: 0,
      quarterlyEnabled: false,
      quarterlyPrice: null,
      yearlyEnabled: false,
      yearlyPrice: null,
      status: 'active',
      tier: 0,
      pointsQuota: 0,
      storageGB: 0,
      domesticAccounts: 0,
      overseasAccounts: 0,
      features: [],
    })
    setPlanDrawerOpen(true)
  }

  const openEditPlan = (plan: PlanRow) => {
    setEditingPlanSlug(plan.slug)
    setEditingPlan({ ...plan })
    setPlanDrawerOpen(true)
  }

  const savePlan = async () => {
    if (!editingPlan || !editingPlan.name.trim() || !editingPlan.slug.trim()) {
      return toast.error('请填写套餐名称与 slug')
    }
    setPlanSaving(true)
    try {
      const saved = await upsertPlanApi(editingPlanSlug, planPayload(editingPlan))
      const savedRow = mapPlan(saved)
      // 用接口返回值直接更新本地数组：编辑→替换该 slug；新建→追加到末尾
      setPlans((prev) => {
        if (editingPlanSlug && prev.some((p) => p.slug === editingPlanSlug)) {
          return prev.map((p) => (p.slug === editingPlanSlug ? savedRow : p))
        }
        return [...prev, savedRow]
      })
      toast.success('套餐已同步至后端')
      setPlanDrawerOpen(false)
      setEditingPlan(null)
      setEditingPlanSlug(null)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('保存套餐失败')
    } finally {
      setPlanSaving(false)
    }
  }

  const updateEditing = (patch: Partial<PlanRow>) =>
    setEditingPlan((prev) => (prev ? { ...prev, ...patch } : null))

  const openSyncPlan = (plan: PlanRow) => {
    setSyncMode('upgrade_only')
    setSyncingPlan(plan)
  }

  const handleSyncQuota = async () => {
    if (!syncingPlan) return
    setSyncBusy(true)
    try {
      const res = await syncPlanQuotaApi(syncingPlan.slug, syncMode)
      toast.success(
        res.synced > 0
          ? `已把「${syncingPlan.name}」额度同步到 ${res.synced} 位在用用户`
          : `「${syncingPlan.name}」当前没有在用用户，无需同步`,
      )
      setSyncingPlan(null)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('同步额度失败')
    } finally {
      setSyncBusy(false)
    }
  }

  const openDeletePlan = (plan: PlanRow) => {
    // 默认转换目标：优先 Free，否则第一个其它套餐
    const others = plans.filter((p) => p.slug !== plan.slug)
    const dflt = others.find((p) => p.slug === 'free')?.slug ?? others[0]?.slug ?? ''
    setConvertTarget(dflt)
    setDeletingPlan(plan)
  }

  const handleDeletePlan = async () => {
    if (!deletingPlan) return
    if (!convertTarget) {
      return toast.error('请选择用户转换到的目标套餐')
    }
    const targetName = plans.find((p) => p.slug === convertTarget)?.name ?? convertTarget
    setPlanDeleting(true)
    try {
      const res = await deletePlanApi(deletingPlan.slug, convertTarget)
      setPlans((prev) => prev.filter((p) => p.slug !== deletingPlan.slug))
      toast.success(
        res.migrated > 0
          ? `套餐「${deletingPlan.name}」已删除，${res.migrated} 位用户已转换到「${targetName}」`
          : `套餐「${deletingPlan.name}」已删除`,
      )
      setDeletingPlan(null)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('删除套餐失败')
    } finally {
      setPlanDeleting(false)
    }
  }

  // Addons
  const addonPayload = (row: AddonRow, status?: PlanStatus) => ({
    slug: row.slug.trim(),
    name: row.name.trim(),
    type: row.type,
    unit: row.unit.trim(),
    price_yuan: Math.max(0, Math.floor(Number(row.price)) || 0),
    // 发放数量对所有类型生效（积分数 / GB / 账号数），不再按类型清零
    points_quota: Math.max(0, Math.floor(Number(row.pointsQuota)) || 0),
    sort_order: Math.max(0, Math.floor(Number(row.sortOrder)) || 0),
    status: (status ?? row.status) === 'inactive' ? 'inactive' : 'active',
  })

  const toggleAddonStatus = async (svc: AddonRow) => {
    const next: PlanStatus = svc.status === 'active' ? 'inactive' : 'active'
    try {
      const saved = await upsertAddonApi(svc.slug, { ...addonPayload(svc), status: next })
      const savedRow = mapAddon(saved)
      setServices((prev) => prev.map((p) => (p.slug === svc.slug ? savedRow : p)))
      toast.success(`服务「${svc.name}」已${next === 'active' ? '上架' : '下架'}`)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('更新服务状态失败')
    }
  }

  const openAddAddon = () => {
    setEditingAddonSlug(null)
    setAddonUnitCustom(false)
    setEditingAddon({
      id: '',
      slug: '',
      name: '',
      type: 'points',
      unit: '',
      price: 0,
      pointsQuota: 0,
      sortOrder: 0,
      status: 'active',
    })
    setAddonDrawerOpen(true)
  }

  const openEditAddon = (svc: AddonRow) => {
    setEditingAddonSlug(svc.slug)
    setEditingAddon({ ...svc })
    // 积分类：现有文案与自动生成值不一致时，默认进入自定义模式保留原文案
    setAddonUnitCustom(svc.unit.trim() !== autoAddonUnit(svc.type, svc.pointsQuota))
    setAddonDrawerOpen(true)
  }

  const saveAddon = async () => {
    if (!editingAddon) return
    // 积分类自动模式：单位说明按积分数生成；否则用手填值
    const finalUnit = !addonUnitCustom
      ? autoAddonUnit(editingAddon.type, editingAddon.pointsQuota)
      : editingAddon.unit.trim()
    if (!editingAddon.name.trim() || !editingAddon.slug.trim() || !finalUnit) {
      return toast.error('请填写服务名称、slug 与单位说明')
    }
    setAddonSaving(true)
    try {
      const saved = await upsertAddonApi(
        editingAddonSlug,
        addonPayload({ ...editingAddon, unit: finalUnit }),
      )
      const savedRow = mapAddon(saved)
      setServices((prev) => {
        if (editingAddonSlug && prev.some((p) => p.slug === editingAddonSlug)) {
          return prev.map((p) => (p.slug === editingAddonSlug ? savedRow : p))
        }
        return [...prev, savedRow]
      })
      toast.success('增值服务已同步至后端')
      setAddonDrawerOpen(false)
      setEditingAddon(null)
      setEditingAddonSlug(null)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('保存增值服务失败')
    } finally {
      setAddonSaving(false)
    }
  }

  const updateEditingAddon = (patch: Partial<AddonRow>) =>
    setEditingAddon((prev) => (prev ? { ...prev, ...patch } : null))

  const handleDeleteAddon = async () => {
    if (!deletingAddon) return
    setAddonDeleting(true)
    try {
      await deleteAddonApi(deletingAddon.slug)
      setServices((prev) => prev.filter((s) => s.slug !== deletingAddon.slug))
      toast.success(`增值服务「${deletingAddon.name}」已删除`)
      setDeletingAddon(null)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('删除增值服务失败')
    } finally {
      setAddonDeleting(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="套餐与加包"
        description="管理系统默认套餐与增值服务项；新建后请勿修改 slug"
        icon={Package}
        iconAccent="primary"
        breadcrumbs={[{ label: '计费与订单' }, { label: '套餐与加包' }]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={loadCatalog}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
            ) : (
              <RefreshCw className="size-3.5" strokeWidth={2.25} />
            )}
            刷新
          </Button>
        }
      />

      {/* 套餐区 */}
      <SectionCard
        title="订阅套餐"
        description={loading ? '加载中…' : `共 ${plans.length} 个套餐`}
        icon={CreditCard}
        iconAccent="primary"
        actions={
          <Button size="sm" onClick={openAddPlan}>
            <Plus className="size-3.5" strokeWidth={2.25} />
            新建套餐
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" strokeWidth={2.25} />
            加载中…
          </div>
        ) : plans.length === 0 ? (
          <EmptyState icon={CreditCard} title="暂无套餐数据" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => {
              return (
              <div
                key={plan.id || plan.slug}
                className={cn(
                  'card-hover relative overflow-hidden rounded-xl border border-border bg-card p-4',
                  plan.status === 'inactive' && 'opacity-60',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="size-5 text-primary" strokeWidth={2.25} />
                    <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                    <Badge variant="outline" className="shrink-0 text-[10px] font-medium">
                      档位 {plan.tier}
                    </Badge>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      className={cn(
                        plan.status === 'active'
                          ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {plan.status === 'active' ? '上架中' : '已下架'}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {plan.slug}
                    </Badge>
                  </div>
                </div>
                {/* 月付主价 + 季/年付副价（仅启用档显示） */}
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-foreground">¥{plan.monthlyPrice}</span>
                  <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-600 dark:text-sky-300">
                    / 月
                  </span>
                </div>
                {(plan.quarterlyEnabled || plan.yearlyEnabled) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {plan.quarterlyEnabled && (
                      <span>
                        季付 <span className="font-semibold text-foreground">¥{effectiveQuarterly(plan)}</span> / 季
                      </span>
                    )}
                    {plan.yearlyEnabled && (
                      <span>
                        年付 <span className="font-semibold text-foreground">¥{effectiveYearly(plan)}</span> / 年
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  {[
                    { icon: Coins, label: '赠送积分', value: plan.pointsQuota.toLocaleString() },
                    { icon: HardDrive, label: '存储空间', value: `${plan.storageGB} GB` },
                    { icon: MapPin, label: '国内账号', value: `${plan.domesticAccounts} 个` },
                    { icon: Globe, label: '国外账号', value: `${plan.overseasAccounts} 个` },
                  ].map(({ icon: Icon, label, value }) => (
                    <div
                      key={label}
                      className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2"
                    >
                      <Icon className="size-4 text-muted-foreground" strokeWidth={2.25} />
                      <div>
                        <p className="text-[10px] text-muted-foreground">{label}</p>
                        <p className="text-sm font-medium">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {plan.features.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      包含功能
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {plan.features.map((f, i) => (
                        <Badge
                          key={`${plan.slug}-f-${i}`}
                          variant="outline"
                          className="gap-0.5 text-[10px] font-normal"
                        >
                          <Check className="size-2.5 text-emerald-500" strokeWidth={2.5} />
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={plan.status === 'active'}
                      onCheckedChange={() => togglePlanStatus(plan)}
                      disabled={loading}
                    />
                    <span className="text-xs text-muted-foreground">
                      {plan.status === 'active' ? '上架' : '下架'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditPlan(plan)}>
                      <Settings2 className="size-3.5" strokeWidth={2.25} />
                      编辑
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openSyncPlan(plan)}>
                      <CopyCheck className="size-3.5" strokeWidth={2.25} />
                      同步额度
                    </Button>
                    {plan.slug !== 'free' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => openDeletePlan(plan)}
                      >
                        <Trash2 className="size-3.5" strokeWidth={2.25} />
                        删除
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* 增值服务 */}
      <SectionCard
        title="增值服务 / 加包"
        description={loading ? '加载中…' : `共 ${services.length} 项`}
        icon={Package}
        iconAccent="warning"
        className="mt-4"
        actions={
          <Button size="sm" variant="outline" onClick={openAddAddon}>
            <Plus className="size-3.5" strokeWidth={2.25} />
            新增服务
          </Button>
        }
      >
        {services.length === 0 ? (
          <EmptyState icon={Package} title="暂无增值服务" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...services].sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price).map((svc) => {
              const meta = addonTypeMeta[svc.type]
              const Icon = meta.icon
              return (
                <div
                  key={svc.id || svc.slug}
                  className={cn(
                    'card-hover rounded-xl border border-border bg-card p-4',
                    svc.status === 'inactive' && 'opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2.5">
                      <div className={cn('flex size-9 items-center justify-center rounded-lg bg-muted/30', meta.accent)}>
                        <Icon className="size-4" strokeWidth={2.25} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{svc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {meta.label} · {svc.unit}
                        </p>
                        <Badge variant="outline" className="mt-1 font-mono text-[10px]">
                          {svc.slug}
                        </Badge>
                      </div>
                    </div>
                    <Badge
                      className={cn(
                        svc.status === 'active'
                          ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {svc.status === 'active' ? '上架中' : '已下架'}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-xl font-bold">¥{svc.price}</span>
                    <span className="text-xs text-muted-foreground">{svc.unit}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={svc.status === 'active'}
                        onCheckedChange={() => toggleAddonStatus(svc)}
                        disabled={loading}
                      />
                      <span className="text-xs text-muted-foreground">
                        {svc.status === 'active' ? '上架' : '下架'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditAddon(svc)}>
                        <Settings2 className="size-3.5" strokeWidth={2.25} />
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeletingAddon(svc)}
                      >
                        <Trash2 className="size-3.5" strokeWidth={2.25} />
                        删除
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* Plan Drawer */}
      <DetailDrawer
        open={planDrawerOpen}
        onOpenChange={(o) => !planSaving && setPlanDrawerOpen(o)}
        title={editingPlanSlug ? '编辑套餐' : '新建套餐'}
        description="服务端以 slug 为唯一标识；新建后请勿随意改 slug"
        width="lg"
        padded={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPlanDrawerOpen(false)} disabled={planSaving}>
              取消
            </Button>
            <Button onClick={savePlan} disabled={planSaving}>
              {planSaving ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />
              ) : (
                <Check className="size-4" strokeWidth={2.25} />
              )}
              同步到后端
            </Button>
          </div>
        }
      >
        {editingPlan && (
          <ProForm layout="2-col" className="p-5">
            <ProFormSection title="基础信息">
              <ProFormField label="套餐 slug" required hint="唯一标识，新建后请勿修改">
                <Input
                  value={editingPlan.slug}
                  disabled={!!editingPlanSlug}
                  onChange={(e) => updateEditing({ slug: e.target.value })}
                  placeholder="例如 pro / enterprise"
                />
              </ProFormField>
              <ProFormField label="套餐名称" required>
                <Input
                  value={editingPlan.name}
                  onChange={(e) => updateEditing({ name: e.target.value })}
                  placeholder="例如：专业版"
                />
              </ProFormField>
              <ProFormField
                label="档位"
                required
                hint="数字越大档位越高（免费版填 0）；价格表按档位排序，用户只能升级到更高档位"
              >
                <NumberInput
                  value={editingPlan.tier}
                  onChange={(v) => updateEditing({ tier: Math.max(0, Math.floor(Number(v) || 0)) })}
                  min={0}
                  step={1}
                  precision={0}
                  suffix="档"
                />
              </ProFormField>
            </ProFormSection>

            <ProFormSection title="多周期定价">
              <ProFormField label="月付价（元）" required hint="必填；季付 / 年付默认按 ×3 / ×12 计算">
                <NumberInput
                  value={editingPlan.monthlyPrice}
                  onChange={(v) => updateEditing({ monthlyPrice: v })}
                  min={0}
                  step={0.01}
                  precision={2}
                  prefix="¥"
                />
              </ProFormField>
              <div className="hidden md:block" aria-hidden />
              <ProFormField label="季付价（元）">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={editingPlan.quarterlyEnabled}
                      onCheckedChange={(c) => updateEditing({ quarterlyEnabled: c })}
                    />
                    <span className="text-xs text-muted-foreground">
                      {editingPlan.quarterlyEnabled ? '已启用，留空按月付 ×3' : '未启用，仅月付'}
                    </span>
                  </div>
                  <NumberInput
                    value={editingPlan.quarterlyPrice ?? undefined}
                    onChange={(v) => updateEditing({ quarterlyPrice: v })}
                    min={0}
                    step={0.01}
                    precision={2}
                    prefix="¥"
                    disabled={!editingPlan.quarterlyEnabled}
                    placeholder={`默认 ¥${Math.floor((Number(editingPlan.monthlyPrice) || 0) * 3)}`}
                  />
                </div>
              </ProFormField>
              <ProFormField label="年付价（元）">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={editingPlan.yearlyEnabled}
                      onCheckedChange={(c) => updateEditing({ yearlyEnabled: c })}
                    />
                    <span className="text-xs text-muted-foreground">
                      {editingPlan.yearlyEnabled ? '已启用，留空按月付 ×12' : '未启用，仅月付'}
                    </span>
                  </div>
                  <NumberInput
                    value={editingPlan.yearlyPrice ?? undefined}
                    onChange={(v) => updateEditing({ yearlyPrice: v })}
                    min={0}
                    step={0.01}
                    precision={2}
                    prefix="¥"
                    disabled={!editingPlan.yearlyEnabled}
                    placeholder={`默认 ¥${Math.floor((Number(editingPlan.monthlyPrice) || 0) * 12)}`}
                  />
                </div>
              </ProFormField>
            </ProFormSection>

            <ProFormSection title="额度配额">
              <ProFormField label="赠送积分">
                <NumberInput
                  value={editingPlan.pointsQuota}
                  onChange={(v) => updateEditing({ pointsQuota: v })}
                  min={0}
                  suffix="积分"
                />
              </ProFormField>
              <ProFormField label="存储空间">
                <NumberInput
                  value={editingPlan.storageGB}
                  onChange={(v) => updateEditing({ storageGB: v })}
                  min={0}
                  suffix="GB"
                />
              </ProFormField>
              <ProFormField label="国内社媒账号数">
                <NumberInput
                  value={editingPlan.domesticAccounts}
                  onChange={(v) => updateEditing({ domesticAccounts: v })}
                  min={0}
                  suffix="个"
                />
              </ProFormField>
              <ProFormField label="国外社媒账号数">
                <NumberInput
                  value={editingPlan.overseasAccounts}
                  onChange={(v) => updateEditing({ overseasAccounts: v })}
                  min={0}
                  suffix="个"
                />
              </ProFormField>
            </ProFormSection>

            <ProFormSection title="状态与功能">
              <ProFormField label="状态">
                <ButtonGroup
                  fullWidth
                  value={editingPlan.status}
                  onChange={(v) => updateEditing({ status: v as PlanStatus })}
                  options={[
                    { value: 'active', label: '上架' },
                    { value: 'inactive', label: '下架' },
                  ]}
                />
              </ProFormField>
              <ProFormField label="功能列表" hint="逗号或中文逗号分隔" fullWidth>
                <Input
                  value={editingPlan.features.join('，')}
                  onChange={(e) =>
                    updateEditing({
                      features: e.target.value
                        .split(/[,，]/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="例如：高级AI模型, 定时发布, 数据分析"
                />
              </ProFormField>
            </ProFormSection>
          </ProForm>
        )}
      </DetailDrawer>

      {/* Addon Drawer */}
      <DetailDrawer
        open={addonDrawerOpen}
        onOpenChange={(o) => !addonSaving && setAddonDrawerOpen(o)}
        title={editingAddonSlug ? '编辑增值服务' : '新增增值服务'}
        description="增量包分四类：积分 / 存储 / 国内账号 / 国外账号；slug 为唯一标识，新建后不可修改"
        width="md"
        padded={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddonDrawerOpen(false)} disabled={addonSaving}>
              取消
            </Button>
            <Button onClick={saveAddon} disabled={addonSaving}>
              {addonSaving ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />
              ) : (
                <Check className="size-4" strokeWidth={2.25} />
              )}
              同步到后端
            </Button>
          </div>
        }
      >
        {editingAddon && (
          <ProForm layout="1-col" className="p-5">
            <ProFormField label="服务 slug" required>
              <Input
                value={editingAddon.slug}
                disabled={!!editingAddonSlug}
                onChange={(e) => updateEditingAddon({ slug: e.target.value })}
                placeholder="例如 vas-points-1k"
              />
            </ProFormField>
            <ProFormField label="服务名称" required>
              <Input
                value={editingAddon.name}
                onChange={(e) => updateEditingAddon({ name: e.target.value })}
                placeholder="例如：积分包 10,000"
              />
            </ProFormField>
            <ProFormField label="服务类型" required>
              <div className="grid grid-cols-2 gap-2">
                {(['points', 'storage', 'domestic_account', 'overseas_account'] as const).map((t) => {
                  const info = addonTypeMeta[t]
                  const Icon = info.icon
                  const active = editingAddon.type === t
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={!!editingAddonSlug}
                      onClick={() => {
                        updateEditingAddon({ type: t })
                        // 切换类型默认回到「自动生成」单位说明
                        setAddonUnitCustom(false)
                      }}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition',
                        active
                          ? 'border-primary bg-primary/[0.06] text-primary'
                          : 'border-border hover:bg-muted/30',
                        !!editingAddonSlug && 'opacity-60',
                      )}
                    >
                      <Icon className="size-4" strokeWidth={2.25} />
                      {info.label}
                    </button>
                  )
                })}
              </div>
            </ProFormField>
            <ProFormField
              label="单位说明（仅展示）"
              hint="仅用于前端展示，不影响实际发放数量；默认按「发放数量」自动生成。增量包是一次性发放的额度（非按周期循环），请勿写「/月」之类的周期文案"
            >
              {addonUnitCustom ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editingAddon.unit}
                    onChange={(e) => updateEditingAddon({ unit: e.target.value })}
                    placeholder="自定义展示文案"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setAddonUnitCustom(false)
                      updateEditingAddon({ unit: '' })
                    }}
                  >
                    自动
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    value={autoAddonUnit(editingAddon.type, editingAddon.pointsQuota)}
                    readOnly
                    className="text-muted-foreground"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setAddonUnitCustom(true)}
                  >
                    自定义
                  </Button>
                </div>
              )}
            </ProFormField>
            <ProFormField label="价格（元）" required>
              <NumberInput
                value={editingAddon.price}
                onChange={(v) => updateEditingAddon({ price: v })}
                min={0}
                step={0.01}
                precision={2}
                prefix="¥"
              />
            </ProFormField>
            <ProFormField
              label={ADDON_QUOTA_META[editingAddon.type].label}
              required
              hint={ADDON_QUOTA_META[editingAddon.type].hint}
            >
              <NumberInput
                value={editingAddon.pointsQuota}
                onChange={(v) => updateEditingAddon({ pointsQuota: v })}
                min={0}
                suffix={ADDON_QUOTA_META[editingAddon.type].suffix}
              />
            </ProFormField>
            <ProFormField
              label="展示排序"
              hint="数字越小越靠前；后加的包可设中间值插入已有包之间（如设 15 排到 10 和 20 之间）"
            >
              <NumberInput
                value={editingAddon.sortOrder}
                onChange={(v) => updateEditingAddon({ sortOrder: Math.max(0, Math.floor(Number(v) || 0)) })}
                min={0}
              />
            </ProFormField>
            <ProFormField label="状态">
              <ButtonGroup
                fullWidth
                value={editingAddon.status}
                onChange={(v) => updateEditingAddon({ status: v as PlanStatus })}
                options={[
                  { value: 'active', label: '上架' },
                  { value: 'inactive', label: '下架' },
                ]}
              />
            </ProFormField>
          </ProForm>
        )}
      </DetailDrawer>

      {/* 删除套餐二次确认（强警告：会转换用户到所选套餐） */}
      <AlertDialog
        open={!!deletingPlan}
        onOpenChange={(o) => !planDeleting && !o && setDeletingPlan(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-destructive" strokeWidth={2.25} />
              确认删除套餐「{deletingPlan?.name}」？
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  删除后，<span className="font-semibold text-destructive">当前正在使用该套餐的用户将被转换到下方所选套餐</span>
                  （永久积分余额保留，套餐配额按新套餐刷新）。
                </p>
                <p>此操作不可恢复，请慎重！</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground">用户转换到</label>
            <Select
              value={convertTarget}
              onValueChange={setConvertTarget}
              disabled={planDeleting}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择目标套餐" />
              </SelectTrigger>
              <SelectContent>
                {plans
                  .filter((p) => p.slug !== deletingPlan?.slug)
                  .map((p) => (
                    <SelectItem key={p.slug} value={p.slug}>
                      {p.name}（{p.slug}）
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={planDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDeletePlan()
              }}
              disabled={planDeleting || !convertTarget}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {planDeleting && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              确认删除并转换用户
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 同步额度到存量用户 */}
      <AlertDialog
        open={!!syncingPlan}
        onOpenChange={(o) => !syncBusy && !o && setSyncingPlan(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CopyCheck className="size-5 text-primary" strokeWidth={2.25} />
              同步「{syncingPlan?.name}」额度到存量用户
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  把该套餐<span className="font-medium text-foreground">当前已保存的额度</span>
                  （积分 {syncingPlan?.pointsQuota.toLocaleString()} · 存储 {syncingPlan?.storageGB}GB · 国内{' '}
                  {syncingPlan?.domesticAccounts} · 国外 {syncingPlan?.overseasAccounts}）下发给所有正在使用本套餐的用户。
                </p>
                <p className="text-muted-foreground">
                  不影响已用量、永久积分余额与到期日。若刚改过额度，请先在「编辑」里保存再同步。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-foreground">同步方式</label>
            <ButtonGroup
              fullWidth
              value={syncMode}
              onChange={(v) => setSyncMode(v as 'upgrade_only' | 'align')}
              options={[
                { value: 'upgrade_only', label: '只升不降' },
                { value: 'align', label: '强制对齐' },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {syncMode === 'upgrade_only'
                ? '各项额度取「现有快照」与「套餐新值」的较大者，只会上调、不会缩减或踢账号（安全）。'
                : '各项额度直接等于套餐新值，可能下调；若有用户在用的账号数超过新名额，会出现超额，请谨慎。'}
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={syncBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleSyncQuota()
              }}
              disabled={syncBusy}
              className={
                syncMode === 'align'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : undefined
              }
            >
              {syncBusy && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              确认同步
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除增值服务二次确认 */}
      <AlertDialog
        open={!!deletingAddon}
        onOpenChange={(o) => !addonDeleting && !o && setDeletingAddon(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-destructive" strokeWidth={2.25} />
              确认删除增值服务「{deletingAddon?.name}」？
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  删除后该服务将从「增值服务 / 加包」列表移除，用户端不再可购买。
                  <span className="text-muted-foreground">历史订单与已发放的积分流水不受影响</span>。
                </p>
                <p>此操作不可恢复，请确认。</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={addonDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDeleteAddon()
              }}
              disabled={addonDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {addonDeleting && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}
