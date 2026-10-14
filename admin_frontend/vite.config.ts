import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * 后台管理系统前端（admin_frontend）
 * - dev: 5290（避开主站 5288）
 * - dev proxy /api → backend :8020（管理后台 API 已并入 backend，路由 /api/v1/admin/*）
 * - 生产：vite build → dist/，Nginx 静态托管
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5290,
    proxy: {
      '/api': {
        target: process.env.ADMIN_API_URL ?? 'http://localhost:8020',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1024,
  },
})
