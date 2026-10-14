/**
 * 抖音「发布风控」检测与解除对话框。
 *
 * 流程：打开 → 查风控状态 → 若处于风控，按上游返回的 check_methods 让用户二选一：
 *  - 登录密码（password）：用户当场输入抖音登录密码（前端不留存、后端不落库）→ 解除
 *  - 短信验证码（smscode）：发送验证码到账号绑定手机（返回掩码号）→ 用户填验证码 → 解除
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2, ShieldCheck, ShieldAlert, KeyRound, MessageSquareCode } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from '@/components/common/Toast'
import { tlfApi } from '@/api/tlf'
import type { RiskStatus } from '@/types/tlf'
import { ApiError } from '@/types/api'

/** 解除风控所需的最小账号信息（TlfAccount 与任务快照都可满足） */
export interface RiskAccountRef {
  id: string
  platform_code: string
  platform_user_name?: string | null
  platform_user_id?: string | null
}

interface RiskControlDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: RiskAccountRef | null
  /** 成功解除后回调（父组件可刷新/提示） */
  onResolved?: () => void
}

type Method = 'password' | 'smscode'
type Phase = 'loading' | 'error' | 'clean' | 'form' | 'done'

const METHOD_LABEL: Record<string, string> = { password: '登录密码', smscode: '短信验证码' }

export function RiskControlDialog({ open, onOpenChange, account, onResolved }: RiskControlDialogProps) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [errMsg, setErrMsg] = useState('')
  const [methods, setMethods] = useState<Method[]>([])
  const [method, setMethod] = useState<Method>('password')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [maskedMobile, setMaskedMobile] = useState('')
  const [sendingSms, setSendingSms] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const acctId = account?.id

  const loadStatus = useCallback(async () => {
    if (!acctId) return
    setPhase('loading')
    setErrMsg('')
    try {
      const s: RiskStatus = await tlfApi.getRiskStatus(acctId)
      if (!s.risk_status) {
        setPhase('clean')
        return
      }
      const raw = (s.check_methods ?? []).map((m) => m.type).filter((t): t is Method => t === 'password' || t === 'smscode')
      const avail = raw.length > 0 ? Array.from(new Set(raw)) : (['password', 'smscode'] as Method[])
      setMethods(avail)
      setMethod(avail[0])
      setPhase('form')
    } catch (err) {
      setErrMsg(err instanceof ApiError ? err.message : '查询风控状态失败')
      setPhase('error')
    }
  }, [acctId])

  // 打开时拉状态；关闭时重置
  useEffect(() => {
    if (open && acctId) {
      setPassword('')
      setCode('')
      setMaskedMobile('')
      void loadStatus()
    }
  }, [open, acctId, loadStatus])

  const handleSendSms = async () => {
    if (!acctId) return
    setSendingSms(true)
    try {
      const res = await tlfApi.sendRiskSms(acctId)
      setMaskedMobile(res?.mobile ?? '')
      toast.success(res?.mobile ? `验证码已发送至 ${res.mobile}` : '验证码已发送')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '发送验证码失败')
    } finally {
      setSendingSms(false)
    }
  }

  const handleConfirm = async () => {
    if (!acctId) return
    if (method === 'password' && !password.trim()) {
      toast.error('请输入抖音登录密码')
      return
    }
    if (method === 'smscode' && !code.trim()) {
      toast.error('请输入短信验证码')
      return
    }
    setSubmitting(true)
    try {
      await tlfApi.confirmRisk(acctId, {
        method,
        password: method === 'password' ? password : undefined,
        code: method === 'smscode' ? code : undefined,
      })
      setPhase('done')
      toast.success('风控解除请求已提交')
      onResolved?.()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '解除失败，请核对密码/验证码后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-amber-500" /> 解除发布风控
          </DialogTitle>
          <DialogDescription>
            {account?.platform_user_name || account?.platform_user_id || '抖音账号'} · 抖音
          </DialogDescription>
        </DialogHeader>

        {phase === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> 正在检测风控状态…
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-rose-600">{errMsg}</p>
            <p className="text-xs text-muted-foreground">
              若提示登录态失效，请先到「账号管理」重新扫码授权该账号后再试。
            </p>
            <Button variant="outline" className="w-full cursor-pointer" onClick={() => void loadStatus()}>
              重试
            </Button>
          </div>
        )}

        {phase === 'clean' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <ShieldCheck className="size-10 text-emerald-500" />
            <p className="text-sm font-medium">该账号当前无发布风控</p>
            <p className="text-xs text-muted-foreground">可以正常发布；若发布仍失败，请查看具体失败原因。</p>
            <Button className="mt-2 cursor-pointer" onClick={() => onOpenChange(false)}>知道了</Button>
          </div>
        )}

        {phase === 'done' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <ShieldCheck className="size-10 text-emerald-500" />
            <p className="text-sm font-medium">已提交解除请求</p>
            <p className="text-xs text-muted-foreground">稍候即可重新发布；如仍被拦截，可再次检测并解除。</p>
            <Button className="mt-2 cursor-pointer" onClick={() => onOpenChange(false)}>完成</Button>
          </div>
        )}

        {phase === 'form' && (
          <div className="space-y-4 py-2">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              检测到该账号处于发布风控，需完成验证后才能正常发布。
            </p>

            {/* 解除方式切换（上游支持多种时显示） */}
            {methods.length > 1 && (
              <div className="inline-flex w-full rounded-lg border bg-card p-0.5">
                {methods.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={cn(
                      'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                      method === m ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {m === 'password' ? <KeyRound className="size-3.5" /> : <MessageSquareCode className="size-3.5" />}
                    {METHOD_LABEL[m] ?? m}
                  </button>
                ))}
              </div>
            )}

            {method === 'password' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">抖音登录密码</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入该抖音号的登录密码"
                  autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground/80">密码仅用于本次解除验证，不会被保存。</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">短信验证码</label>
                <div className="flex gap-2">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="输入收到的验证码"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 cursor-pointer"
                    disabled={sendingSms}
                    onClick={() => void handleSendSms()}
                  >
                    {sendingSms ? <Loader2 className="size-4 animate-spin" /> : '发送验证码'}
                  </Button>
                </div>
                {maskedMobile && (
                  <p className="text-[11px] text-muted-foreground/80">验证码已发送至 {maskedMobile}</p>
                )}
              </div>
            )}

            <Button className="w-full cursor-pointer" disabled={submitting} onClick={() => void handleConfirm()}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : '解除风控'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
