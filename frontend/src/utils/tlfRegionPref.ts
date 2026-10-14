/**
 * 「添加新授权账号」的代理区域选择行为偏好（本地持久化，per 浏览器）。
 *
 * - remember：使用上次选择的网络区域（有可用的上次区域则直接用，不再弹窗）
 * - ask：每次添加账号都弹窗选择网络区域
 *
 * 默认 remember（对应区域选择弹窗里「记住选择，不再提示」默认勾选）。
 * 账号管理页右上角「设置」与弹窗里的勾选框读写同一个值，保持一致。
 */
const KEY = 'tlf:add-account-region-behavior'

export type RegionBehavior = 'remember' | 'ask'

export function getRegionBehavior(): RegionBehavior {
  try {
    return localStorage.getItem(KEY) === 'ask' ? 'ask' : 'remember'
  } catch {
    return 'remember'
  }
}

export function setRegionBehavior(value: RegionBehavior): void {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    /* localStorage 不可用时静默降级（行为退回每次默认 remember） */
  }
}
