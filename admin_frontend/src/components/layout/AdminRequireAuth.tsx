import * as React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { useAdminAuthStore } from '@/stores/adminAuthStore'
import { fetchAdminMe } from '@/lib/api/auth'

/** 路由守卫：未登录跳 /admin/login?next=…；登录后拉一次 /admin/me 落 store */
export function AdminRequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { token, user, hydrate, setUser, logout } = useAdminAuthStore()
  const [loading, setLoading] = React.useState(!user)

  React.useEffect(() => {
    hydrate()
  }, [hydrate])

  React.useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    if (user) {
      setLoading(false)
      return
    }
    let mounted = true
    setLoading(true)
    fetchAdminMe()
      .then((u) => {
        if (!mounted) return
        // 容错：me 返回不同字段名
        const role = (u as { role?: string }).role ?? 'user'
        setUser({
          id: (u as { id: string }).id,
          email: (u as { email: string }).email,
          nickname: (u as { nickname?: string | null }).nickname ?? null,
          role: role as 'super_admin' | 'admin' | 'user' | 'sales' | 'finance',
        })
      })
      .catch((err) => {
        if (!mounted) return
        toast.error(err?.message ?? '登录已失效')
        logout()
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [token, user, setUser, logout])

  if (!token) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/admin/login?next=${next}`} replace />
  }

  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" strokeWidth={2.25} />
      </div>
    )
  }

  return <>{children}</>
}
