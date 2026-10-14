/**
 * 后台 API 客户端（axios），导出 `adminRequest(path, init)` / `adminFormPost(path, formData)`，
 * 供 src/lib/api/*.ts 业务模块使用。
 *
 *  - axios 统一拦截器 + 取消 + 超时
 *  - 401 / code=40100 → 自动跳 /admin/login?next=
 *  - 业务错误统一抛 ApiBusinessError
 */
import axios, { type AxiosRequestConfig, type AxiosInstance } from 'axios'

import { clearAdminToken, getAdminToken } from '@/lib/admin-token'
import { ApiBusinessError } from '@/lib/api/schema'

/** 业务码 40100 = AuthenticationError；HTTP 401 同义 */
function isAuthError(httpStatus: number | undefined, bizCode: number | undefined): boolean {
  return httpStatus === 401 || bizCode === 40100
}

/** Token 失效：清 token → 跳登录页（携带 next）；登录页本身 401 不触发，避免回环 */
function handleAuthFailure(): void {
  if (typeof window === 'undefined') return
  if (window.location.pathname.startsWith('/admin/login')) return
  clearAdminToken()
  const next = encodeURIComponent(window.location.pathname + window.location.search)
  window.location.href = `/admin/login?next=${next}`
}

function apiBase(): string {
  // Vite 环境变量：VITE_ADMIN_API_BASE_URL 覆盖；默认走相对 /api/v1（由 vite dev proxy 或 nginx 反代）
  const env = (import.meta as { env?: Record<string, string> }).env
  const base = env?.VITE_ADMIN_API_BASE_URL ?? ''
  return (base || '/api/v1').replace(/\/+$/, '')
}

const client: AxiosInstance = axios.create({
  baseURL: apiBase(),
  timeout: 120_000,
  headers: { Accept: 'application/json' },
})

client.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? getAdminToken() : null
  if (token) {
    config.headers = config.headers ?? {}
    ;(config.headers as Record<string, string>).Authorization = `Bearer ${token}`
  }
  // 防止浏览器 / 中间代理对 GET 响应做缓存（典型现象：保存后列表显示旧值，F5 才更新）。
  // 双保险：禁用缓存的请求头 + 唯一时间戳查询参数。
  const method = (config.method ?? 'get').toLowerCase()
  if (method === 'get') {
    config.headers = config.headers ?? {}
    const h = config.headers as Record<string, string>
    h['Cache-Control'] = 'no-cache'
    h['Pragma'] = 'no-cache'
    config.params = { ...(config.params ?? {}), _t: Date.now() }
  }
  return config
})

/** 统一拆 `{code,message,data}` envelope，业务错误抛 ApiBusinessError */
async function unwrap<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const res = await client.request(config)
    const payload = (res.data ?? {}) as { code?: number; message?: string; data?: unknown }
    const code = typeof payload.code === 'number' ? payload.code : undefined
    if (code !== undefined && code !== 0) {
      if (isAuthError(res.status, code)) handleAuthFailure()
      throw new ApiBusinessError(payload.message || '请求失败', code)
    }
    return payload.data as T
  } catch (e) {
    if (e instanceof ApiBusinessError) throw e
    if (axios.isAxiosError(e)) {
      const status = e.response?.status
      const body = (e.response?.data ?? {}) as { code?: number; message?: string }
      const code = typeof body.code === 'number' ? body.code : status
      if (isAuthError(status, body.code)) handleAuthFailure()
      throw new ApiBusinessError(body.message || e.message || '请求失败', code)
    }
    throw new ApiBusinessError((e as Error)?.message || '请求失败')
  }
}

/** `path` 以 `/admin/...` 开头；init 形态类似 fetch RequestInit（含 `json` 便捷字段） */
export async function adminRequest<T = unknown>(
  path: string,
  init?: Omit<RequestInit, 'body' | 'headers'> & {
    json?: unknown
    body?: BodyInit | null
    headers?: Record<string, string>
  },
): Promise<T> {
  const config: AxiosRequestConfig = {
    url: path,
    method: (init?.method as AxiosRequestConfig['method']) ?? 'GET',
    headers: { ...(init?.headers ?? {}) },
  }
  if (init?.json !== undefined) {
    config.data = init.json
    ;(config.headers as Record<string, string>)['Content-Type'] = 'application/json'
  } else if (init?.body !== undefined && init.body !== null) {
    config.data = init.body
  }
  return unwrap<T>(config)
}

/** multipart 上传，浏览器自动带 boundary */
export async function adminFormPost<T = unknown>(path: string, formData: FormData): Promise<T> {
  return unwrap<T>({
    url: path,
    method: 'POST',
    data: formData,
  })
}
