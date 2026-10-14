import axios from 'axios'
import type { ApiResponse } from '@/types/api'
import { ApiError } from '@/types/api'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor: inject Authorization header
api.interceptors.request.use((config) => {
  // Dynamic import to avoid circular dependency
  const token = (window as any).__AUTH_TOKEN__
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Track refresh state
let isRefreshing = false
let failedQueue: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = []

function processQueue(error: unknown) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(undefined)
  })
  failedQueue = []
}

// Response interceptor
api.interceptors.response.use(
  (response) => {
    // Blob / file downloads bypass the JSON envelope check
    if (response.config.responseType === 'blob') {
      return response.data as any
    }
    const body = response.data as ApiResponse
    if (body.code !== 0) {
      return Promise.reject(new ApiError(body.code, body.message))
    }
    return body.data as any
  },
  async (error) => {
    const originalRequest = error.config
    // 公开 auth 端点（登录/注册/发码/重置/刷新）失败时不应触发 refresh-token 重试
    const url = originalRequest.url ?? ''
    const isAuthEndpoint =
      url.startsWith('/auth/login') ||
      url.startsWith('/auth/register') ||
      url.startsWith('/auth/refresh') ||
      url.startsWith('/auth/send-sms-code') ||
      url.startsWith('/auth/reset-password')
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(() => api(originalRequest))
      }
      originalRequest._retry = true
      isRefreshing = true
      try {
        const refreshToken = localStorage.getItem('matrix365_refresh_token')
        if (!refreshToken) throw new Error('No refresh token')
        const resp = await axios.post('/api/v1/auth/refresh', { refresh_token: JSON.parse(refreshToken) })
        const data = resp.data?.data
        if (data?.access_token) {
          ;(window as any).__AUTH_TOKEN__ = data.access_token
          localStorage.setItem('matrix365_refresh_token', JSON.stringify(data.refresh_token))
        }
        processQueue(null)
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError)
        ;(window as any).__AUTH_TOKEN__ = null
        localStorage.removeItem('matrix365_refresh_token')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }
    const status = error.response?.status ?? 0
    const body = error.response?.data as ApiResponse | undefined
    const msg = body?.message || error.message || '请求失败'
    const code = body?.code ?? status
    return Promise.reject(new ApiError(code, msg))
  }
)

export default api
