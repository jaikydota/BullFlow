import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ExternalLink, Globe, Loader2, Plus, RefreshCw, Settings, ShieldAlert, Trash2, Users } from 'lucide-react'

import { Button as UIButton } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { parseApiDate } from '@/utils/format'
import { Button } from '@/components/common/Button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
import { toast } from '@/components/common/Toast'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { AuthDialog } from '@/components/tlf/AuthDialog'
import { RegionSelectDialog } from '@/components/tlf/RegionSelectDialog'
import { RiskControlDialog } from '@/components/tlf/RiskControlDialog'
import { PlatformBadge } from '@/components/tlf/PlatformBadge'
import { PlatformLogo } from '@/components/tlf/PlatformLogo'
import { tlfApi } from '@/api/tlf'
import type { TlfAccount, TlfAccountStatus, TlfProxyRegionsResponse } from '@/types/tlf'
import { getVisiblePlatforms, isOverseaPlatform } from '@/utils/tlfPlatforms'
import { RegionTabs, matchRegion, type RegionValue } from '@/components/tlf/RegionTabs'
import { getRegionBehavior, setRegionBehavior, type RegionBehavior } from '@/utils/tlfRegionPref'
import { ApiError } from '@/types/api'

type Filter = 'all' | string

const STATUS_LABEL: Record<TlfAccountStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: '正常', variant: 'default' },
  expired: { label: '登录过期', variant: 'secondary' },
  revoked: { label: '已撤销', variant: 'destructive' },
}

export default function TlfAccountsPage() {
  const [accounts, setAccounts] = useState<TlfAccount[]>([])
  const [loading, setLoading] = useState(false)
  // 筛选：'all' | 'domestic' | 'oversea' | 平台 code（区域与平台同一条筛选）
  const [filter, setFilter] = useState<Filter>('all')
  const [authOpen, setAuthOpen] = useState(false)
  // 重新授权时预选的平台（来自点了「重新授权」的那行账号）；普通「添加账号」清空走 filter
  const [reauthPlatform, setReauthPlatform] = useState<string | undefined>(undefined)
  // 本次授权选定的代理网络区域（绑定前的区域选择流程产出）
  const [authRegion, setAuthRegion] = useState<string | undefined>(undefined)
  // 区域选择弹窗
  const [regionDialogOpen, setRegionDialogOpen] = useState(false)
  const [regionData, setRegionData] = useState<TlfProxyRegionsResponse | null>(null)
  const [pendingPlatform, setPendingPlatform] = useState<string | undefined>(undefined)
  const [preparingAuth, setPreparingAuth] = useState(false)
  // 「添加账号行为」设置弹窗
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [behavior, setBehavior] = useState<RegionBehavior>(getRegionBehavior())
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set())
  const [revokeTarget, setRevokeTarget] = useState<TlfAccount | null>(null)
  const [riskAccount, setRiskAccount] = useState<TlfAccount | null>(null)

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const list = await tlfApi.listAccounts()
      setAccounts(list)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '加载账号失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAccounts()
  }, [fetchAccounts])

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      const oversea = isOverseaPlatform(a.platform_code)
      if (filter === 'all') return true
      if (filter === 'domestic') return !oversea
      if (filter === 'oversea') return oversea
      return a.platform_code === filter
    })
  }, [accounts, filter])

  // 批量检查所有账号登录态：网关单批有上限，前端分批(20)顺序调用，逐批增量更新列表 + 进度
  const [checkingAll, setCheckingAll] = useState(false)
  const [checkProgress, setCheckProgress] = useState<{ done: number; total: number } | null>(null)
  const handleCheckAll = async () => {
    const ids = accounts.map((a) => a.id)
    if (ids.length === 0) { toast.error('暂无账号可检查'); return }
    setCheckingAll(true)
    setCheckProgress({ done: 0, total: ids.length })
    const CHUNK = 20
    let expiredCnt = 0
    let errorCnt = 0
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        const results = await tlfApi.syncAccountsBatch(chunk)
        const byId = new Map(results.map((r) => [r.id, r]))
        setAccounts((prev) => prev.map((a) => (byId.has(a.id) ? { ...a, ...byId.get(a.id)! } : a)))
        for (const r of results) {
          if (r.login_check === 'expired') expiredCnt++
          else if (r.login_check === 'error') errorCnt++
        }
        setCheckProgress({ done: Math.min(i + CHUNK, ids.length), total: ids.length })
      }
      toast.success(
        `已检查 ${ids.length} 个账号` +
        `：${expiredCnt} 个登录失效` +
        (errorCnt ? `，${errorCnt} 个检测异常（可稍后重试）` : ''),
      )
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '批量检查失败')
    } finally {
      setCheckingAll(false)
      setCheckProgress(null)
    }
  }

  const handleSync = async (id: string) => {
    setSyncingIds((s) => new Set(s).add(id))
    try {
      const fresh = await tlfApi.syncAccount(id)
      setAccounts((prev) => prev.map((a) => (a.id === fresh.id ? fresh : a)))
      // login_check = 本次登录态检测结论：error=检测异常(多为平台风控临时限制)，status 未更新
      if (fresh.login_check === 'expired') {
        toast.error('该账号登录已失效，请重新扫码授权')
      } else if (fresh.login_check === 'error') {
        toast.error('登录态检测异常（可能被平台风控临时限制），当前状态未更新，请稍后重试')
      } else {
        toast.success('已同步')
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '同步失败')
    } finally {
      setSyncingIds((s) => {
        const ns = new Set(s)
        ns.delete(id)
        return ns
      })
    }
  }

  /** 打开扫码授权弹窗（带本次选定的平台 + 区域） */
  const openAuth = useCallback((platform: string | undefined, region: string | undefined) => {
    setReauthPlatform(platform)
    setAuthRegion(region)
    setAuthOpen(true)
  }, [])

  /**
   * 「添加账号 / 重新授权」入口：绑定前先决定代理区域。
   * - 无可用区域 → 直接授权（网关全局分配）。
   * - 行为=记住 且 上次区域仍可用 → 直接用上次，不弹窗。
   * - 否则弹区域选择窗。取区域失败不阻断授权（降级直接授权）。
   */
  const startAddAccount = useCallback(async (platform: string | undefined) => {
    // 海外平台（明确指定，如重新授权）：走 Composio OAuth，无代理无区域，直接进授权
    if (platform && isOverseaPlatform(platform)) {
      openAuth(platform, undefined)
      return
    }
    setPreparingAuth(true)
    try {
      const data = await tlfApi.getProxyRegions()
      if (!data.regions || data.regions.length === 0) {
        openAuth(platform, undefined)
        return
      }
      const lastUsable =
        !!data.last_selected_region && data.regions.includes(data.last_selected_region)
      if (getRegionBehavior() === 'remember' && lastUsable) {
        openAuth(platform, data.last_selected_region!)
        return
      }
      setRegionData(data)
      setPendingPlatform(platform)
      setRegionDialogOpen(true)
    } catch {
      // 取区域失败：不阻断绑定，直接授权（网关按全局/上次分配）
      openAuth(platform, undefined)
    } finally {
      setPreparingAuth(false)
    }
  }, [openAuth])

  /** 区域选择「下一步」：记住偏好 → 进入扫码授权 */
  const handleRegionConfirm = useCallback((region: string, remember: boolean) => {
    const beh: RegionBehavior = remember ? 'remember' : 'ask'
    setRegionBehavior(beh)
    setBehavior(beh)
    setRegionDialogOpen(false)
    openAuth(pendingPlatform, region)
  }, [openAuth, pendingPlatform])

  /** 设置弹窗里切换行为，即时持久化 */
  const handleBehaviorChange = useCallback((v: RegionBehavior) => {
    setBehavior(v)
    setRegionBehavior(v)
  }, [])

  const handleRevoke = async () => {
    if (!revokeTarget) return
    const target = revokeTarget
    try {
      await tlfApi.revokeAccount(target.id)
      // 乐观更新：立即从列表移除，不依赖 refetch（避免 loading 抖动 / 列表回写失败）
      setAccounts((prev) => prev.filter((a) => a.id !== target.id))
      toast.success('账号已删除')
      setRevokeTarget(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '删除失败')
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="账号管理"
        description="扫码授权抖音、小红书等社媒账号，本期支持云端托管。"
        icon={Users}
        iconAccent="primary"
        breadcrumbs={[{ label: '创作分发' }, { label: '全球发布' }, { label: '账号管理' }]}
        actions={
          <div className="flex items-center gap-2">
            <UIButton
              variant="outline"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              className="cursor-pointer"
              title="授权设置"
            >
              <Settings className="size-4" />
            </UIButton>
            <UIButton
              variant="outline"
              onClick={() => void handleCheckAll()}
              disabled={checkingAll || accounts.length === 0}
              className="cursor-pointer"
              title="逐个检测所有账号的登录态（账号多时较慢，会分批检查）"
            >
              {checkingAll ? (
                <><Loader2 className="size-4 animate-spin" /> 检查中 {checkProgress ? `${checkProgress.done}/${checkProgress.total}` : ''}</>
              ) : (
                <><RefreshCw className="size-4" /> 批量检查状态</>
              )}
            </UIButton>
            <UIButton
              onClick={() => void startAddAccount(undefined)}
              disabled={preparingAuth}
              className="cursor-pointer"
            >
              {preparingAuth ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} 添加账号
            </UIButton>
          </div>
        }
      />

      <SectionCard className="mt-6">
        {/* 筛选：区域大类（段控）与单平台（outline chips）分两段，视觉隔离 */}
        <div className="mb-5 space-y-3">
          <RegionTabs
            value={(['all', 'domestic', 'oversea'] as const).includes(filter as RegionValue) ? (filter as RegionValue) : null}
            onChange={(v) => setFilter(v)}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {getVisiblePlatforms().map((p) => (
              <button
                key={p.code}
                type="button"
                onClick={() => setFilter(p.code)}
                className={cn(
                  'inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  filter === p.code
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                )}
              >
                <PlatformLogo code={p.code} size={14} className="mr-1.5" />
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" /> 加载中…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title="还没有账号"
            description={filter === 'all' ? '点击右上角「添加账号」发起首次授权。' : '该平台下还没有授权账号。'}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>账号</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>最近授权</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => {
                const status = STATUS_LABEL[a.status]
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          {a.platform_avatar && <AvatarImage src={a.platform_avatar} alt={a.platform_user_name ?? ''} />}
                          <AvatarFallback>
                            {(a.platform_user_name ?? a.platform_user_id ?? '?').slice(0, 1)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{a.platform_user_name ?? a.platform_user_id}</p>
                          <p className="truncate text-xs text-muted-foreground">{a.platform_user_id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <PlatformBadge code={a.platform_code} />
                        {isOverseaPlatform(a.platform_code) && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                            <Globe className="size-3" /> 海外
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.last_authed_at ? parseApiDate(a.last_authed_at).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2">
                        {(() => {
                          // 网关已兜底：platform_home_url = 用户主页或平台首页，home_url_is_profile 标明是哪种
                          const link = a.platform_home_url
                            ? { url: a.platform_home_url, isProfile: !!a.home_url_is_profile }
                            : null
                          if (!link) return null
                          return (
                            <UIButton size="sm" variant="outline" asChild>
                              <a href={link.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="size-3.5" />
                                {link.isProfile ? '主页' : '平台'}
                              </a>
                            </UIButton>
                          )
                        })()}
                        {a.status === 'expired' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={preparingAuth}
                            onClick={() => void startAddAccount(a.platform_code)}
                          >
                            <RefreshCw className="size-3.5" />
                            重新授权
                          </Button>
                        )}
                        {a.platform_code === 'DouYin' && a.status === 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRiskAccount(a)}
                            title="检测并解除抖音发布风控"
                          >
                            <ShieldAlert className="size-3.5" />
                            风控
                          </Button>
                        )}
                        {a.status !== 'revoked' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={syncingIds.has(a.id)}
                            onClick={() => void handleSync(a.id)}
                          >
                            {syncingIds.has(a.id) ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="size-3.5" />
                            )}
                            检查状态
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setRevokeTarget(a)}
                        >
                          <Trash2 className="size-3.5" />
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <RiskControlDialog
        open={!!riskAccount}
        onOpenChange={(o) => !o && setRiskAccount(null)}
        account={riskAccount}
      />

      <RegionSelectDialog
        open={regionDialogOpen}
        onOpenChange={setRegionDialogOpen}
        regions={regionData?.regions ?? []}
        lastSelectedRegion={regionData?.last_selected_region ?? null}
        defaultRemember={behavior === 'remember'}
        onConfirm={handleRegionConfirm}
      />

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        defaultPlatformCode={
          reauthPlatform ??
          // filter 是具体平台 code → 用它；是区域(全部/国内/全球) → 取该区域第一个平台，避免 Select 为空
          (filter === 'all' || filter === 'domestic' || filter === 'oversea'
            ? getVisiblePlatforms().find((p) => matchRegion(filter, p.code))?.code
            : filter)
        }
        region={authRegion}
        existingAccountIds={accounts.map((a) => a.id)}
        onSuccess={(acc) => {
          setAccounts((prev) => [acc, ...prev.filter((a) => a.id !== acc.id)])
        }}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>授权设置</DialogTitle>
            <DialogDescription>添加新授权账号时是否每次选择代理网络区域。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <p className="text-sm font-medium">添加新授权账号行为</p>
            {([
              { value: 'remember' as const, label: '使用上次选择的网络区域', desc: '有可用的上次区域则直接使用，不再弹窗' },
              { value: 'ask' as const, label: '弹窗选择网络区域', desc: '每次添加账号都弹窗选择' },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleBehaviorChange(opt.value)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors cursor-pointer',
                  behavior === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                    behavior === opt.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                  )}
                >
                  {behavior === opt.value && <Check className="size-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground">{opt.desc}</span>
                </span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <UIButton onClick={() => setSettingsOpen(false)} className="cursor-pointer">完成</UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除该账号？</AlertDialogTitle>
            <AlertDialogDescription>
              将同步撤销云端授权并从本地列表移除，无法用于后续发布。
              历史发布任务的账号快照保留不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRevoke()} className="cursor-pointer">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}
