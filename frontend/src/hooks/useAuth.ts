import { useAuthStore } from '@/stores/authStore'

export function useAuth() {
  const { user, isAuthenticated, loading, login, logout } = useAuthStore()
  return {
    user,
    isAuthenticated,
    loading,
    login,
    logout,
    isAdmin: user?.role === 'admin' || user?.role === 'super_admin',
    isSuperAdmin: user?.role === 'super_admin',
  }
}
