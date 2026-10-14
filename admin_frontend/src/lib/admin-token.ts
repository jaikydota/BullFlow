const STORAGE_KEY = 'matrix365_admin_access_token'

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEY)
}

export function setAdminToken(token: string): void {
  window.localStorage.setItem(STORAGE_KEY, token)
}

export function clearAdminToken(): void {
  window.localStorage.removeItem(STORAGE_KEY)
}
