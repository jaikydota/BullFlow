import * as React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getAdminToken } from '@/lib/admin-token'
import { fetchAdminMe, loginAdmin } from '@/lib/api/auth'
import { ApiBusinessError } from '@/lib/api/schema'
import { useAdminAuthStore } from '@/stores/adminAuthStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextHref = searchParams.get('next') || '/admin/dashboard'
  const hydrate = useAdminAuthStore((s) => s.hydrate)

  const [account, setAccount] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  // 已登录 → 直接跳 next
  React.useEffect(() => {
    const token = getAdminToken()
    if (!token) return
    let cancelled = false
    fetchAdminMe()
      .then(() => {
        if (!cancelled) {
          hydrate()
          navigate(nextHref.startsWith('/') ? nextHref : '/admin/dashboard', { replace: true })
        }
      })
      .catch(() => {
        /* token 失效则留在登录页 */
      })
    return () => {
      cancelled = true
    }
  }, [navigate, nextHref, hydrate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!account.trim() || !password) {
      toast.error('请输入邮箱 / 手机号和密码')
      return
    }
    if (password.length < 8) {
      toast.error('密码至少 8 位')
      return
    }
    setBusy(true)
    try {
      await loginAdmin(account.trim(), password)
      hydrate()
      toast.success('登录成功')
      navigate(nextHref.startsWith('/') ? nextHref : '/admin/dashboard', { replace: true })
    } catch (err) {
      if (err instanceof ApiBusinessError) {
        toast.error(err.message)
      } else {
        toast.error('无法连接服务端，请检查 backend / 环境变量')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex h-full min-h-screen flex-1 items-center justify-center overflow-hidden bg-[#F6F5FC] p-6 dark:bg-background">
      {/* 装饰光斑 */}
      <span className="blob-primary -left-32 -top-24 size-[420px] animate-blob" />
      <span className="blob-rose -bottom-24 -right-32 size-[360px] animate-blob" />

      <Card className="relative z-10 w-full max-w-md border-border/70 shadow-modal">
        <CardHeader className="space-y-3 text-center">
          <img
            src="/logo.png"
            alt="推量牛"
            className="mx-auto size-20 shrink-0 select-none"
            draggable={false}
          />
          <CardTitle className="text-xl font-semibold">推量牛 · 管理后台</CardTitle>
          <CardDescription className="text-sm">
            管理员 / 销售 / 财务账号登录，支持<span className="font-medium text-foreground">邮箱或已绑定手机号</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-account">邮箱 / 手机号</Label>
              <Input
                id="admin-account"
                type="text"
                autoComplete="username"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="邮箱或手机号"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">密码</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              {busy ? '登录中…' : '登录'}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link
              to="/"
              className="cursor-pointer underline-offset-4 hover:text-foreground hover:underline"
            >
              返回前台
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
