import { create } from 'zustand'

/**
 * 全局人机验证：任意位置 `await requestCaptcha()` 即弹出滑块，
 * 通过返回一次性 ticket，取消则 reject。需在 App 根挂载 <CaptchaHost />。
 */
interface CaptchaState {
  open: boolean
  _resolve: ((ticket: string) => void) | null
  _reject: ((reason?: unknown) => void) | null
  request: () => Promise<string>
  succeed: (ticket: string) => void
  cancel: () => void
}

export const CAPTCHA_CANCELLED = 'captcha_cancelled'

export const useCaptchaStore = create<CaptchaState>((set, get) => ({
  open: false,
  _resolve: null,
  _reject: null,
  request: () =>
    new Promise<string>((resolve, reject) => {
      // 若已有未决请求，先取消旧的，避免悬挂
      get()._reject?.(new Error(CAPTCHA_CANCELLED))
      set({ open: true, _resolve: resolve, _reject: reject })
    }),
  succeed: (ticket) => {
    get()._resolve?.(ticket)
    set({ open: false, _resolve: null, _reject: null })
  },
  cancel: () => {
    get()._reject?.(new Error(CAPTCHA_CANCELLED))
    set({ open: false, _resolve: null, _reject: null })
  },
}))

/** 弹出人机验证，返回一次性 ticket；用户取消时 reject(Error(CAPTCHA_CANCELLED)) */
export function requestCaptcha(): Promise<string> {
  return useCaptchaStore.getState().request()
}
