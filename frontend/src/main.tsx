import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@/i18n'
import { App } from './App.tsx'
import { useAuthStore } from '@/stores/authStore'
import { storage } from '@/utils/storage'

// 捕获销售引流邀请码 ?invitation_code=xxx → localStorage（最新覆盖），并清理 URL。
// 必须在 React 渲染 / 路由重定向之前同步执行：未登录访问会立刻 <Navigate to="/login"> 丢掉 query。
try {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('invitation_code')
  if (code && code.trim()) {
    storage.set('invitation_code', code.trim())
    params.delete('invitation_code')
    const qs = params.toString()
    window.history.replaceState(
      {},
      '',
      window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
    )
  }
} catch {
  /* ignore */
}

// 新版本部署后，旧页面引用的 hash 分片会 404 →
// 「Failed to fetch dynamically imported module」。监听 Vite 预加载错误，
// 自动刷新一次拉取最新 index.html（时间戳防刷新风暴）。
window.addEventListener('vite:preloadError', () => {
  const KEY = 'chunk_reload_at'
  const last = Number(sessionStorage.getItem(KEY) || '0')
  if (Date.now() - last > 10000) {
    sessionStorage.setItem(KEY, String(Date.now()))
    window.location.reload()
  }
})

void useAuthStore.getState().hydrate()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
