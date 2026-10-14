import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { UserRole } from '@/types/user'
import { Spinner } from '@/components/common/Spinner'
import { useAuth } from '@/hooks/useAuth'

export type ProtectedRouteProps = {
  children: ReactNode
  roles?: readonly UserRole[]
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { isAuthenticated, loading, user } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-slate-50">
        <Spinner size="lg" className="text-primary-600" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (roles && roles.length > 0 && user && !roles.includes(user.role)) {
    return <Navigate to="/403" replace />
  }

  return <div className="flex h-full min-h-0 w-full flex-1 flex-col">{children}</div>
}
