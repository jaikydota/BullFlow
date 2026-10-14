const PREFIX = 'matrix365_'

export const storage = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      // storage full or unavailable
    }
  },

  remove(key: string): void {
    localStorage.removeItem(PREFIX + key)
  },

  clear(): void {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX))
    keys.forEach((k) => localStorage.removeItem(k))
  },
}

export const session = {
  get<T>(key: string): T | null {
    try {
      const raw = sessionStorage.getItem(PREFIX + key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },

  set<T>(key: string, value: T): void {
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      // storage full or unavailable
    }
  },

  remove(key: string): void {
    sessionStorage.removeItem(PREFIX + key)
  },
}
