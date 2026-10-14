import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// 开发：vite dev server :5391，/api/* 代理到本机 tlf-backend (8041)。
// 生产：独立域名（如 tlf-365.chuhaibang.com）→ tlf-frontend 容器（nginx :8040，见 nginx.conf）→ /api/* 反代到 tlf-backend (8041)；SPA 走根路径。
export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5391,
    host: '0.0.0.0',  // 允许 LAN 访问（内网穿透 webhook 测试）
    strictPort: true,
    proxy: {
      // 所有 /api/* 直接打到 tlf-backend
      '/api': {
        target: 'http://localhost:8041',
        changeOrigin: true,
      },
    },
  },
})
