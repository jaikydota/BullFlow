import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, Globe, Info, Loader2, QrCode, RefreshCw, ScanLine, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/common/Toast'
import { tlfApi } from '@/api/tlf'
import { getVisiblePlatforms, getPlatformByCode, isOverseaPlatform } from '@/utils/tlfPlatforms'
import { PlatformLogo } from '@/components/tlf/PlatformLogo'
import { RegionTabs, matchRegion, type RegionValue } from '@/components/tlf/RegionTabs'
import type { TlfAccount } from '@/types/tlf'
import { ApiError } from '@/types/api'

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 已有账号列表，用于轮询时判断「新账号是否出现」 */
  existingAccountIds: string[]
  /** 检测到新账号入库后回调（用于父组件刷新列表） */
  onSuccess: (account: TlfAccount) => void
  /** 打开弹窗时默认选中的平台（来自账号管理页「筛选平台」）；不传则保持上次/首个 */
  defaultPlatformCode?: string
  /** 本次授权使用的代理网络区域（AccountsPage 在打开前选定）；不传则由网关沿用上次/全局分配 */
  region?: string
}

type Stage = 'select' | 'pending' | 'success' | 'failed'

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 5 * 60 * 1000

export function AuthDialog({ open, onOpenChange, existingAccountIds, onSuccess, defaultPlatformCode, region }: AuthDialogProps) {
  const [stage, setStage] = useState<Stage>('select')
  const platforms = getVisiblePlatforms()
  const [platformCode, setPlatformCode] = useState<string>(platforms[0]?.code ?? 'DouYin')
  const [loading, setLoading] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [newAccount, setNewAccount] = useState<TlfAccount | null>(null)
  const [probing, setProbing] = useState(false)
  const [password, setPassword] = useState('')
  const [scanStatus, setScanStatus] = useState<'pending' | 'scanned'>('pending')
  const [failMessage, setFailMessage] = useState<string | null>(null)
  /** 「我已扫码」是 webhook 丢消息的兜底按钮，默认隐藏：
   *  scanStatus='scanned'（webhook 已确认扫码）或 60s 后才显示 */
  const [showProbeButton, setShowProbeButton] = useState(false)
  const [regionFilter, setRegionFilter] = useState<RegionValue>('all')
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const probeRevealRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const platformMeta = useMemo(() => getPlatformByCode(platformCode), [platformCode])
  const isOversea = isOverseaPlatform(platformCode)
  const needsPassword = !!platformMeta?.needsPassword
  // 仅对**确定要求**密码的平台显示输入框（其他平台直接走纯扫码授权）
  const showPasswordField = needsPassword
  const canStart =
    !!platformCode && (!needsPassword || password.trim().length > 0)

  const reset = () => {
    setStage('select')
    setQrCode(null)
    setNewAccount(null)
    setProbing(false)
    setPassword('')
    setScanStatus('pending')
    setFailMessage(null)
    setShowProbeButton(false)
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (probeRevealRef.current) clearTimeout(probeRevealRef.current)
  }

  useEffect(() => {
    if (open) {
      // 打开时套用页面「筛选平台」的默认选择（仅 select 阶段有意义）
      if (defaultPlatformCode) {
        setPlatformCode(defaultPlatformCode)
        setPassword('')
        // 区域段控同步到默认平台所属区域，避免 Select 默认平台与段控不一致
        setRegionFilter(isOverseaPlatform(defaultPlatformCode) ? 'oversea' : 'domestic')
      }
    } else {
      reset()
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (probeRevealRef.current) clearTimeout(probeRevealRef.current)
    }
  }, [open, defaultPlatformCode])

  // 扫码确认（webhook SCAN）后立即放出兜底按钮
  useEffect(() => {
    if (scanStatus === 'scanned') setShowProbeButton(true)
  }, [scanStatus])

  const stopPolling = () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }

  const startPolling = (opId: string | null) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    pollTimerRef.current = setInterval(async () => {
      try {
        // 1) 优先查 op 状态：能看到 SCAN 已确认 / FAILED 终态
        if (opId) {
          const st = await tlfApi.getAuthStatus(opId)
          if (st.status === 'scanned') {
            setScanStatus('scanned')
          } else if (st.status === 'failed') {
            stopPolling()
            setFailMessage(st.errorMessage || '云端代登录失败')
            setStage('failed')
            return
          } else if (st.status === 'success') {
            // auth-status=success 即落账完成 → 直接收尾。新账号优先；**重复授权**是更新已有
            // 账号（同 id，不在 existingAccountIds，"找新账号"会落空），用 webhook 回传的
            // accountId 定位被更新账号，避免一直卡 pending。
            stopPolling()
            const list = await tlfApi.listAccounts({ platform_code: platformCode })
            const acc =
              list.find((a) => !existingAccountIds.includes(a.id) && a.status === 'active') ??
              list.find((a) => a.id === st.accountId) ??
              list.find((a) => a.status === 'active')
            if (acc) {
              setNewAccount(acc)
              onSuccess(acc)
            }
            setStage('success')
            return
          }
        }

        // 2) 兜底：直接看本地账号列表是否多出来（webhook 已落库）
        const list = await tlfApi.listAccounts({ platform_code: platformCode })
        const fresh = list.find(
          (a) => !existingAccountIds.includes(a.id) && a.status === 'active',
        )
        if (fresh) {
          stopPolling()
          setNewAccount(fresh)
          setStage('success')
          onSuccess(fresh)
        }
      } catch {
        /* 轮询失败忽略，继续下一次 */
      }
    }, POLL_INTERVAL_MS)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      toast.error('授权超时，请重新发起')
      reset()
    }, POLL_TIMEOUT_MS)
  }

  const handleStart = async () => {
    if (needsPassword && !password.trim()) {
      toast.error(`${platformMeta?.name ?? platformCode}云授权需要账号密码`)
      return
    }
    setLoading(true)
    try {
      const data = await tlfApi.startAuthorization({
        platform_code: platformCode,
        password: password.trim() || undefined,
        region: region || undefined,
      })
      // 海外平台(Composio)：新标签打开 OAuth 授权页，原页轮询落账
      if (data.redirect_url) {
        window.open(data.redirect_url, '_blank', 'noopener,noreferrer')
      }
      setQrCode(data.qr_code)
      setStage('pending')
      setScanStatus('pending')
      setFailMessage(null)
      setShowProbeButton(false)
      // 60s 后兜底显示「我已扫码」（webhook 失约场景）
      if (probeRevealRef.current) clearTimeout(probeRevealRef.current)
      probeRevealRef.current = setTimeout(() => setShowProbeButton(true), 60_000)
      startPolling(data.operation_id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '发起授权失败')
    } finally {
      setLoading(false)
    }
  }

  /** 我已扫码：webhook 未送达时主动从云端拉取账号列表 */
  const handleProbe = async () => {
    setProbing(true)
    try {
      const created = await tlfApi.probeAccounts({ platform_code: platformCode })
      const fresh = created.find((a) => !existingAccountIds.includes(a.id))
      if (fresh) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        setNewAccount(fresh)
        setStage('success')
        onSuccess(fresh)
      } else {
        toast.error('暂未发现新账号，请确认已在 App 内完成授权后稍后再试')
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '同步失败')
    } finally {
      setProbing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 禁止点击遮罩 / 按 Esc 关闭，防止扫码授权过程中误关弹窗；只能通过按钮显式关闭 */}
      <DialogContent
        className="max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>添加授权账号</DialogTitle>
          <DialogDescription>
            选择目标平台后扫码授权，账号将托管在云端，可一键发布内容。
          </DialogDescription>
        </DialogHeader>

        {(stage === 'select' || stage === 'pending') && (
          <div className="space-y-4 py-2">
            {/* 二维码 / 占位 —— pending 阶段才出 QR */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-56 w-56 items-center justify-center rounded-lg border border-dashed bg-card">
                {stage === 'pending' && qrCode ? (
                  qrCode.startsWith('http') || qrCode.startsWith('data:') ? (
                    <img
                      src={qrCode}
                      alt="授权二维码"
                      className="size-full object-contain p-3"
                      // 微信视频号返回的二维码偏浅，前端提高对比度加深，保证可扫
                      style={
                        platformCode === 'ShiPinHao'
                          ? { filter: 'contrast(0) brightness(0.1)' }
                          : undefined
                      }
                    />
                  ) : (
                    <div className="break-all p-3 text-xs text-muted-foreground">{qrCode}</div>
                  )
                ) : isOversea ? (
                  <div className="flex flex-col items-center gap-2 px-4 text-center text-muted-foreground">
                    <ExternalLink className="size-12" />
                    <span className="text-xs">
                      {stage === 'pending'
                        ? '已在新标签打开授权页，完成授权后自动返回'
                        : `点击「发起授权」将打开 ${platformMeta?.name ?? platformCode} 授权页`}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <QrCode className="size-12" />
                    <span className="text-xs">配置下方信息后生成二维码</span>
                  </div>
                )}
              </div>
              {stage === 'pending' && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {isOversea
                    ? '等待授权完成…'
                    : scanStatus === 'scanned'
                      ? '已扫码，正在云端完成登录…'
                      : '等待用户扫码授权…'}
                </div>
              )}
            </div>

            {/* 平台选择 —— pending 阶段锁定；区域段控放标题行右侧 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium">选择平台</label>
                <RegionTabs
                  value={regionFilter}
                  size="sm"
                  disabled={stage === 'pending'}
                onChange={(v) => {
                  setRegionFilter(v)
                  // 当前选中平台不在新区域 → 自动切到该区域第一个
                  const list = platforms.filter((p) => matchRegion(v, p.code))
                  if (list.length && !list.some((p) => p.code === platformCode)) {
                    setPlatformCode(list[0].code)
                    setPassword('')
                  }
                }}
                />
              </div>
              <Select
                value={platformCode}
                onValueChange={(v) => {
                  setPlatformCode(v)
                  setPassword('')
                }}
                disabled={stage === 'pending'}
              >
                <SelectTrigger className="w-full cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(regionFilter === 'all' || regionFilter === 'domestic') && (
                    <SelectGroup>
                      <SelectLabel>国内平台</SelectLabel>
                      {platforms.filter((p) => !isOverseaPlatform(p.code)).map((p) => (
                        <SelectItem key={p.code} value={p.code} className="cursor-pointer">
                          <span className="flex items-center gap-2">
                            <PlatformLogo code={p.code} size={16} />
                            {p.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {(regionFilter === 'all' || regionFilter === 'oversea') && (
                    <SelectGroup>
                      <SelectLabel>全球平台（需 VPN）</SelectLabel>
                      {platforms.filter((p) => isOverseaPlatform(p.code)).map((p) => (
                        <SelectItem key={p.code} value={p.code} className="cursor-pointer">
                          <span className="flex items-center gap-2">
                            <PlatformLogo code={p.code} size={16} />
                            {p.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* 海外平台：仅「授权登录」这一步需 VPN（OAuth 跳转）；发布由云端代发、无需 VPN */}
            {isOversea && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <Globe className="mt-0.5 size-4 shrink-0" />
                <span>
                  海外平台<strong>授权登录</strong>需在能正常访问该平台的网络环境（VPN / 代理）下完成授权；
                  授权后<strong>发布无需 VPN</strong>（内容由云端代发）。
                </span>
              </div>
            )}

            {/* 密码 —— 跟在 QR / 平台下面，pending 阶段锁定 */}
            {showPasswordField && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {platformMeta?.name ?? '平台'}账号密码
                  <span className="ml-1 text-rose-500">*</span>
                </label>
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder="请输入您的账号登录密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={stage === 'pending'}
                />
                <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  <span>
                    密码仅用于云端模拟登录你的账号，请求转发后本平台不存储。
                  </span>
                </p>
              </div>
            )}
          </div>
        )}

        {stage === 'success' && newAccount && (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
              <CheckCircle2 className="size-7" />
            </div>
            <div>
              <p className="text-base font-semibold">授权成功</p>
              <p className="mt-1 text-sm text-muted-foreground">
                已绑定账号：{newAccount.platform_user_name ?? newAccount.platform_user_id}
              </p>
            </div>
          </div>
        )}

        {stage === 'failed' && (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-600">
              <XCircle className="size-7" />
            </div>
            <div className="space-y-2">
              <p className="text-base font-semibold">授权失败</p>
              <p className="text-sm text-rose-700">
                {failMessage || '云端代登录未完成'}
              </p>
              <div className="rounded-md bg-muted/40 p-3 text-left text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">常见原因：</p>
                <ul className="list-inside list-disc space-y-0.5">
                  <li>账号密码不正确（云端用此密码代登录）</li>
                  <li>未配置 SOCKS5 代理（DouYin 强制要求）</li>
                  <li>平台异地登录风控拦截</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {stage === 'select' && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="cursor-pointer"
              >
                取消
              </Button>
              <Button
                onClick={() => void handleStart()}
                disabled={loading || !canStart}
                className="cursor-pointer"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                发起授权
              </Button>
            </>
          )}
          {stage === 'pending' && (
            <>
              <Button variant="outline" onClick={reset} className="cursor-pointer">
                <RefreshCw className="size-4" />
                重新选择
              </Button>
              {showProbeButton && (
                <Button
                  variant="outline"
                  onClick={() => void handleProbe()}
                  disabled={probing}
                  className="cursor-pointer"
                  title="webhook 失约时的兜底：主动拉取云端最新账号列表"
                >
                  {probing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ScanLine className="size-4" />
                  )}
                  我已扫码
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)} className="cursor-pointer">
                关闭
              </Button>
            </>
          )}
          {stage === 'success' && (
            <Button onClick={() => onOpenChange(false)} className="cursor-pointer">
              完成
            </Button>
          )}
          {stage === 'failed' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">
                关闭
              </Button>
              <Button onClick={reset} className="cursor-pointer">
                <RefreshCw className="size-4" /> 重新发起授权
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
