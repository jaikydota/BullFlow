import * as React from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Gift, Loader2, Plus, RefreshCw, Save, TriangleAlert, Users } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageContainer, PageHeader } from '@/components/shared'
import {
  ButtonGroup,
  DataTable,
  DetailDrawer,
  DetailModal,
  FilterBar,
  NumberInput,
  ProForm,
  ProFormField,
  ProFormSection,
  SearchInput,
} from '@/components/admin'
import { fetchAdminMe } from '@/lib/api/auth'
import {
  fetchAddons,
  fetchPlans,
  grantAddonApi,
  grantSubscriptionApi,
  type AdminAddonFromApi,
  type AdminPlanFromApi,
} from '@/lib/api/saas'
import {
  createAdminUser,
  fetchAdminUserDetail,
  fetchAdminUserList,
  patchAdminUser,
  type AdminUserPatchPayload,
} from '@/lib/api/users'
import {
  ApiBusinessError,
  type AdminUserDetail,
  type AdminUserListRow,
} from '@/lib/api/schema'
import { usePagination } from '@/hooks/usePagination'
import { formatDate } from '@/lib/format'

const ROLE_LABEL: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  user: '普通用户',
  sales: '销售',
  finance: '财务',
}

/** 占位邮箱（手机号注册用户的内部占位）不展示给运营 */
function isPlaceholderEmail(email?: string | null): boolean {
  return !!email && email.endsWith('@matrix365.local')
}

/** 编辑态展示用：占位邮箱显示为空（让运营填真实邮箱），真实邮箱原样 */
function realEmailDisplay(email?: string | null): string {
  return isPlaceholderEmail(email) ? '' : (email ?? '')
}

function displayName(row: Pick<AdminUserListRow, 'nickname' | 'email' | 'phone'>): string {
  const n = row.nickname?.trim()
  if (n) return n
  if (row.email && !isPlaceholderEmail(row.email)) return row.email.split('@')[0]
  if (row.phone) return row.phone
  return row.email?.split('@')[0] ?? row.email ?? '未命名'
}

function coerceRole(r: string): 'super_admin' | 'admin' | 'user' {
  if (r === 'super_admin' || r === 'admin' || r === 'user') return r
  return 'user'
}

/** 国内手机号 11 位格式校验（输入态，不含 86 前缀） */
function isValidCnPhone(v: string): boolean {
  return /^1[3-9]\d{9}$/.test(v.trim())
}

/** 把入库的 '86'+11 位手机号还原为 11 位用于输入框展示 */
function cnPhoneDisplay(stored?: string | null): string {
  if (!stored) return ''
  const d = stored.replace(/\D/g, '')
  if (d.length === 13 && d.startsWith('86')) return d.slice(2)
  if (d.length === 11) return d
  return stored
}

type GrantPeriod = 'month' | 'quarter' | 'year'
const PERIOD_LABEL: Record<GrantPeriod, string> = { month: '月付', quarter: '季付', year: '年付' }

/** 套餐在售周期（月付始终在售；季/年看启用开关） */
function planPeriods(p: AdminPlanFromApi): GrantPeriod[] {
  const out: GrantPeriod[] = ['month']
  if (p.quarterlyEnabled) out.push('quarter')
  if (p.yearlyEnabled) out.push('year')
  return out
}

/** 套餐在指定周期的有效价（元）：自定义价优先，否则月付 ×3 / ×12 */
function planEffPrice(p: AdminPlanFromApi, period: GrantPeriod): number {
  if (period === 'quarter') return p.quarterlyPrice ?? p.monthlyPrice * 3
  if (period === 'year') return p.yearlyPrice ?? p.monthlyPrice * 12
  return p.monthlyPrice
}

export default function UsersPage() {
  const pagination = usePagination({ page: 1, pageSize: 20 })
  const { page, pageSize, setPage, setTotal } = pagination

  const [items, setItems] = React.useState<AdminUserListRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searchInput, setSearchInput] = React.useState('')
  const [appliedQuery, setAppliedQuery] = React.useState('')
  const [roleFilter, setRoleFilter] = React.useState<'all' | 'super_admin' | 'admin' | 'user'>('all')

  const [me, setMe] = React.useState<{ id: string; role: string } | null>(null)
  const [selectedUser, setSelectedUser] = React.useState<AdminUserListRow | null>(null)
  const [detail, setDetail] = React.useState<AdminUserDetail | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [editNickname, setEditNickname] = React.useState('')
  const [editEmail, setEditEmail] = React.useState('')
  const [editPhone, setEditPhone] = React.useState('')
  const [editRole, setEditRole] = React.useState<'super_admin' | 'admin' | 'user'>('user')
  const [editStatus, setEditStatus] = React.useState<'active' | 'disabled'>('active')
  const [editPassword, setEditPassword] = React.useState('')

  const [createOpen, setCreateOpen] = React.useState(false)
  const [createBusy, setCreateBusy] = React.useState(false)
  const [createEmail, setCreateEmail] = React.useState('')
  const [createPassword, setCreatePassword] = React.useState('')
  const [createNickname, setCreateNickname] = React.useState('')
  const [createPhone, setCreatePhone] = React.useState('')
  const [createRole, setCreateRole] = React.useState<'super_admin' | 'admin' | 'user'>('user')

  // 内部开通套餐
  const [plans, setPlans] = React.useState<AdminPlanFromApi[]>([])
  const [grantPlanSlug, setGrantPlanSlug] = React.useState('')
  const [grantPeriod, setGrantPeriod] = React.useState<GrantPeriod>('month')
  const [grantAmount, setGrantAmount] = React.useState(0)
  const [grantPayMethod, setGrantPayMethod] = React.useState('offline')
  const [grantRemark, setGrantRemark] = React.useState('')
  const [granting, setGranting] = React.useState(false)

  // 赠送增量包
  const [addons, setAddons] = React.useState<AdminAddonFromApi[]>([])
  const [grantAddonSlug, setGrantAddonSlug] = React.useState('')
  const [grantAddonQty, setGrantAddonQty] = React.useState(1)
  const [grantAddonRemark, setGrantAddonRemark] = React.useState('')
  const [grantingAddon, setGrantingAddon] = React.useState(false)

  const fetchList = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAdminUserList({
        page,
        page_size: pageSize,
        search: appliedQuery || undefined,
        role: roleFilter === 'all' ? undefined : roleFilter,
      })
      setItems(data.items)
      setTotal(data.total)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('无法加载用户列表')
    } finally {
      setLoading(false)
    }
  }, [appliedQuery, page, pageSize, roleFilter, setTotal])

  React.useEffect(() => {
    fetchList()
  }, [fetchList])

  React.useEffect(() => {
    fetchAdminMe()
      .then((u) => setMe({ id: u.id, role: u.role }))
      .catch(() => setMe(null))
    fetchPlans()
      .then((ps) => setPlans(ps))
      .catch(() => setPlans([]))
    fetchAddons()
      .then((as) => setAddons(as))
      .catch(() => setAddons([]))
  }, [])

  React.useEffect(() => {
    if (!selectedUser) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetail(null)
    fetchAdminUserDetail(selectedUser.id)
      .then((d) => {
        if (cancelled) return
        setDetail(d)
        setEditNickname(d.nickname ?? '')
        setEditEmail(realEmailDisplay(d.email))
        setEditPhone(cnPhoneDisplay(d.phone))
        setEditRole(coerceRole(d.role))
        setEditStatus(d.status === 'disabled' ? 'disabled' : 'active')
        setEditPassword('')
      })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof ApiBusinessError) toast.error(e.message)
        else toast.error('加载用户详情失败')
        setSelectedUser(null)
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedUser])

  const isSelf = !!(me?.id && detail?.id && me.id === detail.id)
  const canEditRole = me?.role === 'super_admin' && !isSelf
  const canCreateUser = me?.role === 'super_admin' || me?.role === 'admin'

  const dirty = React.useMemo(() => {
    if (!detail) return false
    const nickTrim = editNickname.trim()
    const detailNick = (detail.nickname ?? '').trim()
    if (nickTrim !== detailNick) return true
    if (editEmail.trim() !== realEmailDisplay(detail.email)) return true
    if (editPhone.trim() !== cnPhoneDisplay(detail.phone)) return true
    if (editStatus !== detail.status) return true
    if (canEditRole && editRole !== coerceRole(detail.role)) return true
    if (editPassword.trim().length > 0) return true
    return false
  }, [detail, editNickname, editEmail, editPhone, editStatus, editRole, editPassword, canEditRole])

  const tryOpenUser = (user: AdminUserListRow) => {
    if (me?.role === 'admin' && user.role !== 'user') {
      toast.error('当前账号仅可查看租户用户（role=user）')
      return
    }
    // 初始化「内部开通套餐」表单：默认第一个非 free 套餐 + 月付 + 周期原价
    const dflt = plans.find((p) => p.slug !== 'free') ?? plans[0]
    setGrantPlanSlug(dflt?.slug ?? '')
    setGrantPeriod('month')
    setGrantAmount(dflt ? planEffPrice(dflt, 'month') : 0)
    setGrantPayMethod('offline')
    setGrantRemark('')
    setGrantAddonSlug('')
    setGrantAddonQty(1)
    setGrantAddonRemark('')
    setSelectedUser(user)
  }

  const onGrantPlanChange = (slug: string) => {
    setGrantPlanSlug(slug)
    const p = plans.find((x) => x.slug === slug)
    setGrantPeriod('month')
    setGrantAmount(p ? planEffPrice(p, 'month') : 0)
  }

  const onGrantPeriodChange = (period: GrantPeriod) => {
    setGrantPeriod(period)
    const p = plans.find((x) => x.slug === grantPlanSlug)
    if (p) setGrantAmount(planEffPrice(p, period))
  }

  const handleGrant = async () => {
    if (!detail) return
    if (!grantPlanSlug) return toast.error('请选择要开通的套餐')
    if (!grantRemark.trim()) return toast.error('请填写备注（对账必填）')
    const planName = plans.find((p) => p.slug === grantPlanSlug)?.name ?? grantPlanSlug
    setGranting(true)
    try {
      await grantSubscriptionApi({
        user_id: detail.id,
        plan_slug: grantPlanSlug,
        billing_period: grantPeriod,
        amount_yuan: Math.max(0, Math.floor(Number(grantAmount)) || 0),
        pay_method: grantPayMethod,
        remark: grantRemark.trim(),
      })
      toast.success(`已为 ${detail.email} 开通「${planName}」（${PERIOD_LABEL[grantPeriod]}）`)
      setSelectedUser(null) // 开通成功后关闭弹窗
      void fetchList() // 刷新列表，套餐列同步更新
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('开通失败')
    } finally {
      setGranting(false)
    }
  }

  const handleGrantAddon = async () => {
    if (!detail) return
    if (!grantAddonSlug) return toast.error('请选择要赠送的增量包')
    if (!grantAddonRemark.trim()) return toast.error('请填写赠送原因（对账必填）')
    const addonName = addons.find((a) => a.slug === grantAddonSlug)?.name ?? grantAddonSlug
    const qty = Math.max(1, Math.floor(Number(grantAddonQty)) || 1)
    setGrantingAddon(true)
    try {
      await grantAddonApi({
        user_id: detail.id,
        addon_slug: grantAddonSlug,
        quantity: qty,
        remark: grantAddonRemark.trim(),
      })
      toast.success(`已为 ${detail.email} 赠送「${addonName}」×${qty}`)
      setSelectedUser(null) // 赠送成功后关闭弹窗
      void fetchList()
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('赠送失败')
    } finally {
      setGrantingAddon(false)
    }
  }

  const openCreateUser = () => {
    setCreateEmail('')
    setCreatePassword('')
    setCreateNickname('')
    setCreatePhone('')
    setCreateRole('user')
    setCreateOpen(true)
  }

  const submitCreateUser = async () => {
    const email = createEmail.trim()
    const pw = createPassword
    const phone = createPhone.trim()
    if (!email && !phone) return toast.error('邮箱和手机号至少填一个')
    if (!pw || pw.length < 8) return toast.error('密码至少 8 位')
    if (phone && !isValidCnPhone(phone)) return toast.error('请输入正确的 11 位国内手机号')
    const role: 'super_admin' | 'admin' | 'user' =
      me?.role === 'admin' ? 'user' : createRole
    // 防御：系统仅允许一个超管，永不允许新建 super_admin
    if (role === 'super_admin') {
      return toast.error('系统仅允许一个超级管理员，不能新建超管账号')
    }
    setCreateBusy(true)
    try {
      const created = await createAdminUser({
        email: email || null, // 留空走后端占位邮箱逻辑（仅填手机号时）
        password: pw,
        role,
        nickname: createNickname.trim() || null,
        phone: phone || null,
      })
      // 用接口返回值直接插入列表头
      setItems((prev) => [
        {
          id: created.id,
          email: created.email,
          phone: created.phone ?? null,
          nickname: created.nickname ?? null,
          role: created.role,
          status: created.status,
          created_at: created.created_at ?? null,
        },
        ...prev,
      ])
      pagination.setTotal(pagination.total + 1)
      toast.success('账号已创建')
      setCreateOpen(false)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('创建失败')
    } finally {
      setCreateBusy(false)
    }
  }

  const handleSaveDetail = async () => {
    if (!detail) return
    const patch: AdminUserPatchPayload = {}
    const nickTrim = editNickname.trim()
    const detailNick = (detail.nickname ?? '').trim()
    if (nickTrim !== detailNick) patch.nickname = nickTrim
    const emailTrim = editEmail.trim()
    if (emailTrim !== realEmailDisplay(detail.email)) {
      if (!emailTrim) return toast.error('邮箱不能为空')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) return toast.error('请输入正确的邮箱')
      patch.email = emailTrim.toLowerCase()
    }
    const phoneTrim = editPhone.trim()
    if (phoneTrim !== cnPhoneDisplay(detail.phone)) {
      if (phoneTrim && !isValidCnPhone(phoneTrim)) return toast.error('请输入正确的 11 位国内手机号')
      patch.phone = phoneTrim // 空串=清空
    }
    if (editStatus !== detail.status) {
      if (isSelf && editStatus === 'disabled') return toast.error('不可禁用当前登录账号')
      patch.status = editStatus
    }
    if (canEditRole && editRole !== coerceRole(detail.role)) patch.role = editRole
    const pw = editPassword.trim()
    if (pw) {
      if (pw.length < 8) return toast.error('新密码至少 8 位')
      patch.password = pw
    }
    if (Object.keys(patch).length === 0) return toast('没有任何修改')

    setSaving(true)
    try {
      const u = await patchAdminUser(detail.id, patch)
      setDetail(u)
      setEditNickname(u.nickname ?? '')
      setEditEmail(realEmailDisplay(u.email))
      setEditPhone(cnPhoneDisplay(u.phone))
      setEditRole(coerceRole(u.role))
      setEditStatus(u.status === 'disabled' ? 'disabled' : 'active')
      setEditPassword('')
      // 用返回值更新列表里该行，避免依赖二次 GET
      setItems((prev) =>
        prev.map((row) =>
          row.id === u.id
            ? {
                ...row,
                email: u.email,
                phone: u.phone ?? null,
                nickname: u.nickname ?? null,
                role: u.role,
                status: u.status,
              }
            : row,
        ),
      )
      toast.success('已保存')
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const columns = React.useMemo<ColumnDef<AdminUserListRow, unknown>[]>(
    () => [
      {
        header: '用户',
        accessorKey: 'email',
        cell: ({ row }) => {
          const u = row.original
          return (
            <div className="flex items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-pink-500/20 text-xs font-semibold text-primary">
                {displayName(u).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{displayName(u)}</p>
                {!isPlaceholderEmail(u.email) && (
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                )}
                {u.phone && (
                  <p className="truncate text-[11px] text-muted-foreground/80">{u.phone}</p>
                )}
              </div>
            </div>
          )
        },
      },
      {
        header: '套餐',
        accessorKey: 'plan_name',
        size: 150,
        cell: ({ row }) => {
          const u = row.original
          if (!u.plan_name) return <span className="text-xs text-muted-foreground">—</span>
          return (
            <div className="min-w-0">
              <Badge variant="outline" className="text-[10px]">
                {u.plan_name}
              </Badge>
              {u.plan_expires_at && (
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  到期 {formatDate(u.plan_expires_at)}
                </p>
              )}
            </div>
          )
        },
      },
      {
        header: '剩余积分',
        accessorKey: 'points_remaining',
        size: 110,
        cell: ({ row }) => {
          const u = row.original
          if (u.points_remaining == null)
            return <span className="text-xs text-muted-foreground">—</span>
          return (
            <div className="min-w-0">
              <span className="text-sm font-medium tabular-nums text-foreground">
                {u.points_remaining.toLocaleString()}
              </span>
              {u.addon_points != null && u.addon_points > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  含永久 {u.addon_points.toLocaleString()}
                </p>
              )}
            </div>
          )
        },
      },
      {
        header: '角色',
        accessorKey: 'role',
        size: 110,
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px]">
            {ROLE_LABEL[row.original.role] ?? row.original.role}
          </Badge>
        ),
      },
      {
        header: '状态',
        accessorKey: 'status',
        size: 100,
        cell: ({ row }) =>
          row.original.status === 'active' ? (
            <Badge variant="default" className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
              正常
            </Badge>
          ) : (
            <Badge variant="outline">已停用</Badge>
          ),
      },
      {
        header: '注册时间',
        accessorKey: 'created_at',
        size: 180,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{formatDate(row.original.created_at)}</span>
        ),
      },
    ],
    [],
  )

  return (
    <PageContainer>
      <PageHeader
        title="用户管理"
        description="分页列表、搜索与新建；点击用户可查看详情并修改昵称、状态等信息"
        icon={Users}
        iconAccent="info"
        breadcrumbs={[{ label: '用户与权限' }, { label: '用户管理' }]}
        actions={
          <>
            {canCreateUser && (
              <Button size="sm" onClick={openCreateUser} className="gap-1.5">
                <Plus className="size-3.5" strokeWidth={2.25} />
                新建用户
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchList}
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
          </>
        }
      />

      <FilterBar
        search={
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            onSubmit={(v) => {
              setAppliedQuery(v.trim())
              setPage(1)
            }}
            onDebouncedChange={(v) => {
              setAppliedQuery(v.trim())
              setPage(1)
            }}
            placeholder="搜索邮箱、昵称…"
          />
        }
        filters={
          <ButtonGroup
            value={roleFilter}
            onChange={(v) => {
              setRoleFilter(v)
              setPage(1)
            }}
            options={[
              { value: 'all', label: '全部' },
              { value: 'user', label: '普通用户' },
              { value: 'admin', label: '管理员' },
              { value: 'super_admin', label: '超管' },
            ]}
            size="sm"
          />
        }
      />

      <div className="mt-3">
        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          total={pagination.total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          rowKey={(r) => r.id}
          onRowClick={tryOpenUser}
        />
      </div>

      {/* 详情 Drawer */}
      <DetailDrawer
        open={!!selectedUser}
        onOpenChange={(open) => !open && setSelectedUser(null)}
        title="用户详情"
        description={detail?.email}
        width="lg"
        padded={false}
        footer={
          detail ? (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedUser(null)}>
                关闭
              </Button>
              <Button onClick={handleSaveDetail} disabled={saving || !dirty}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />
                ) : (
                  <Save className="size-4" strokeWidth={2.25} />
                )}
                保存修改
              </Button>
            </div>
          ) : null
        }
      >
        <div className="space-y-5 p-5">
          {detailLoading && (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="size-7 animate-spin" strokeWidth={2.25} />
              <p className="text-sm">加载详情…</p>
            </div>
          )}
          {!detailLoading && detail && (
            <>
              <div className="grid gap-1 rounded-lg border border-border bg-muted/20 p-3 text-xs">
                <p className="break-all">
                  <span className="text-muted-foreground">邮箱 · </span>
                  {detail.email}
                </p>
                <p className="break-all font-mono">
                  <span className="text-muted-foreground">id · </span>
                  {detail.id}
                </p>
                <p className="text-muted-foreground">
                  语言 {detail.language ?? '—'} · 注册 {formatDate(detail.created_at)} · 更新{' '}
                  {formatDate(detail.updated_at)}
                </p>
                {detail.created_by && (
                  <p className="break-all font-mono text-muted-foreground">
                    created_by · {detail.created_by}
                  </p>
                )}
              </div>

              <ProForm layout="2-col">
                <ProFormField label="昵称" fullWidth>
                  <Input
                    value={editNickname}
                    onChange={(e) => setEditNickname(e.target.value)}
                    placeholder="昵称"
                  />
                </ProFormField>
                <ProFormField
                  label="邮箱"
                  hint="登录账号之一；手机号注册用户可在此补登真实邮箱"
                  fullWidth
                >
                  <Input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="name@example.com"
                  />
                </ProFormField>
                <ProFormField
                  label="手机号（可选）"
                  hint="国内 11 位手机号；留空则清空绑定"
                  fullWidth
                >
                  <Input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    placeholder="11 位手机号，如 13800000000"
                    inputMode="numeric"
                  />
                </ProFormField>
                <ProFormField label="账号状态">
                  <Select
                    value={editStatus}
                    onValueChange={(v) => {
                      const val = v as 'active' | 'disabled'
                      if (isSelf && val === 'disabled') {
                        toast.error('不可禁用当前登录账号')
                        return
                      }
                      setEditStatus(val)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">正常 active</SelectItem>
                      <SelectItem value="disabled">已停用 disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </ProFormField>
                <ProFormField
                  label="角色"
                  hint={
                    !canEditRole
                      ? '仅 super_admin 可调整他人角色'
                      : coerceRole(detail.role) === 'super_admin'
                        ? '系统仅允许一个超管，可降级但不可再创建'
                        : '系统仅允许一个超管，不可升级为 super_admin'
                  }
                >
                  <Select
                    value={editRole}
                    disabled={!canEditRole}
                    onValueChange={(v) => setEditRole(v as 'super_admin' | 'admin' | 'user')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">普通用户</SelectItem>
                      <SelectItem value="admin">管理员</SelectItem>
                      {/* 仅当目标当前已是 super_admin 才显示该选项；防止升级出"第二个超管" */}
                      {coerceRole(detail.role) === 'super_admin' && (
                        <SelectItem value="super_admin">超级管理员</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </ProFormField>
                <ProFormField label="新密码（可选）" hint="≥8 位，留空不修改" fullWidth>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="≥8 位，留空不修改"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                  />
                </ProFormField>
              </ProForm>

              {/* 内部开通套餐：注入套餐并生成已支付订单（独立于上方「保存修改」） */}
              <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <Gift className="size-4 text-primary" strokeWidth={2.25} />
                  <h4 className="text-sm font-semibold text-foreground">内部开通套餐</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  直接为该用户注入套餐并生成一条已支付订单，用户「订阅与账单 → 订单历史」可见。
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ProFormField label="套餐">
                    <Select value={grantPlanSlug} onValueChange={onGrantPlanChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择套餐" />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => (
                          <SelectItem key={p.slug} value={p.slug}>
                            {p.name}（{p.slug}）
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </ProFormField>
                  {grantPlanSlug === 'free' ? (
                    <ProFormField label="有效期" hint="Free 套餐永久有效，不计费、不分周期">
                      <div className="flex h-9 items-center text-sm font-medium text-foreground">
                        永久有效
                      </div>
                    </ProFormField>
                  ) : (
                    <ProFormField label="计费周期">
                      <Select
                        value={grantPeriod}
                        onValueChange={(v) => onGrantPeriodChange(v as GrantPeriod)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(() => {
                            const sp = plans.find((p) => p.slug === grantPlanSlug)
                            const periods = sp ? planPeriods(sp) : (['month'] as GrantPeriod[])
                            return periods.map((pr) => (
                              <SelectItem key={pr} value={pr}>
                                {PERIOD_LABEL[pr]}
                              </SelectItem>
                            ))
                          })()}
                        </SelectContent>
                      </Select>
                    </ProFormField>
                  )}
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[13px] leading-relaxed text-amber-700 sm:col-span-2 dark:text-amber-300">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
                    <p className="font-medium">
                      请填<span className="font-bold underline decoration-amber-500/60 underline-offset-2">实际收到的金额</span>
                      ，线下购买请备注好价格和原因，不然无法对账。如果是免费开通，请填{' '}
                      <span className="font-bold">0</span>。
                    </p>
                  </div>
                  <ProFormField label="金额（元）" fullWidth>
                    <NumberInput
                      value={grantAmount}
                      onChange={setGrantAmount}
                      min={0}
                      step={0.01}
                      precision={2}
                      prefix="¥"
                    />
                  </ProFormField>
                  <ProFormField label="支付方式">
                    <Select value={grantPayMethod} onValueChange={setGrantPayMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="offline">线下</SelectItem>
                        <SelectItem value="transfer">银行转账</SelectItem>
                        <SelectItem value="alipay">支付宝</SelectItem>
                        <SelectItem value="wechat">微信</SelectItem>
                      </SelectContent>
                    </Select>
                  </ProFormField>
                  <ProFormField label="备注" required fullWidth hint="对账必填：线下价格 / 开通原因等">
                    <Input
                      value={grantRemark}
                      onChange={(e) => setGrantRemark(e.target.value)}
                      placeholder="必填，如：合同编号 ¥XXX / 免费开通 / 活动赠送"
                    />
                  </ProFormField>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={handleGrant}
                    disabled={granting || !grantPlanSlug || !grantRemark.trim()}
                  >
                    {granting ? (
                      <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />
                    ) : (
                      <Gift className="size-4" strokeWidth={2.25} />
                    )}
                    立即开通
                  </Button>
                </div>
              </div>

              {/* 赠送增量包：免费发放增量包额度，生成一条金额 0 的记录订单 */}
              <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <Gift className="size-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.25} />
                  <h4 className="text-sm font-semibold text-foreground">赠送增量包</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  免费为该用户发放增量包额度（积分永久跟人走；存储 / 账号在付费订阅期内有效），并生成一条金额 0 的记录订单。
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ProFormField label="增量包" required>
                    <Select value={grantAddonSlug} onValueChange={setGrantAddonSlug}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择增量包" />
                      </SelectTrigger>
                      <SelectContent>
                        {addons
                          .filter((a) => a.status === 'active')
                          .map((a) => (
                            <SelectItem key={a.slug} value={a.slug}>
                              {a.name}（{(a.pointsQuota ?? 0).toLocaleString()} {a.unit}）
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </ProFormField>
                  <ProFormField label="份数">
                    <NumberInput
                      value={grantAddonQty}
                      onChange={setGrantAddonQty}
                      min={1}
                      step={1}
                      precision={0}
                    />
                  </ProFormField>
                  <ProFormField label="备注" required fullWidth hint="赠送原因，对账必填">
                    <Input
                      value={grantAddonRemark}
                      onChange={(e) => setGrantAddonRemark(e.target.value)}
                      placeholder="必填，如：活动赠送 / 客诉补偿 / 测试账号"
                    />
                  </ProFormField>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={handleGrantAddon}
                    disabled={grantingAddon || !grantAddonSlug || !grantAddonRemark.trim()}
                  >
                    {grantingAddon ? (
                      <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />
                    ) : (
                      <Gift className="size-4" strokeWidth={2.25} />
                    )}
                    赠送增量包
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DetailDrawer>

      {/* 新建用户 Modal */}
      <DetailModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="新建用户"
        description={
          me?.role === 'admin'
            ? '管理员账号仅能创建租户侧普通用户'
            : '可选「管理员」或「普通用户」；系统仅允许一个超管，无法新建 super_admin'
        }
        size="md"
        padded={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createBusy}>
              取消
            </Button>
            <Button onClick={submitCreateUser} disabled={createBusy}>
              {createBusy && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              创建
            </Button>
          </div>
        }
      >
        <ProForm layout="1-col" className="p-5">
          <ProFormSection title="基础信息">
            <ProFormField label="邮箱" hint="邮箱 / 手机号二选一，至少填一个">
              <Input
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </ProFormField>
            <ProFormField label="初始密码" required hint="≥8 位">
              <Input
                type="password"
                autoComplete="new-password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
              />
            </ProFormField>
            <ProFormField label="昵称" hint="默认可用邮箱前缀">
              <Input
                value={createNickname}
                onChange={(e) => setCreateNickname(e.target.value)}
                placeholder="选填"
              />
            </ProFormField>
            <ProFormField label="手机号" hint="与邮箱二选一；只填手机号将自动生成占位邮箱">
              <Input
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="国内 11 位手机号"
                inputMode="numeric"
              />
            </ProFormField>
            <ProFormField
              label="角色"
              hint={
                me?.role === 'admin'
                  ? 'admin 仅可创建普通用户'
                  : '系统仅允许一个超级管理员，无法新建 super_admin 账号'
              }
            >
              <Select
                value={createRole}
                disabled={me?.role === 'admin'}
                onValueChange={(v) => setCreateRole(v as 'super_admin' | 'admin' | 'user')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">普通用户</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                  {/* 故意不渲染 super_admin —— 系统仅允许一个超管 */}
                </SelectContent>
              </Select>
            </ProFormField>
          </ProFormSection>
        </ProForm>
      </DetailModal>
    </PageContainer>
  )
}
