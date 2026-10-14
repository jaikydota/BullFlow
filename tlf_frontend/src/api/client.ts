/**
 * 推量发后台 API 客户端。
 *
 * - 完全独立：自有 JWT，自有 localStorage key
 * - 所有请求自动加 Authorization Bearer
 * - 401 / 40100 → 清 token + 跳本 SPA 内部 /login
 */
import axios, { AxiosInstance } from 'axios'

const TOKEN_KEY = 'tlf_admin_token'
const API_BASE = '/api/admin/v1'

export const adminClient: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

adminClient.interceptors.request.use((cfg) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`
  }
  return cfg
})

adminClient.interceptors.response.use(
  (resp) => {
    const data = resp.data
    // ok() wrapper → 解 envelope；直接 model_validate 的端点保持原样
    if (data && typeof data === 'object' && 'code' in data) {
      if (data.code !== 0) {
        throw new Error(data.message || '请求失败')
      }
      return data.data
    }
    return data
  },
  (err) => {
    const status = err.response?.status
    const code = err.response?.data?.code
    if (status === 401 || code === 40100) {
      localStorage.removeItem(TOKEN_KEY)
      const cur = window.location.pathname + window.location.search
      window.location.href = '/login?next=' + encodeURIComponent(cur)
    }
    const msg = err.response?.data?.message || err.message
    throw new Error(msg)
  },
)
