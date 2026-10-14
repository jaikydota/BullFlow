/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_APP_TITLE?: string
  /** 营销官网地址 —— 登录页"返回官网"按钮跳转目标 */
  readonly VITE_WEBSITE_URL?: string
  /** 操作手册外链 —— Header 右上"操作手册"入口；留空则隐藏入口 */
  readonly VITE_MANUAL_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
