import i18n from 'i18next'
import HttpBackend from 'i18next-http-backend'
import { initReactI18next } from 'react-i18next'
import { useUIStore } from '@/stores/uiStore'

const SUPPORTED_LNGS = ['zh-CN', 'en', 'ko', 'ja', 'fr', 'es'] as const
const FALLBACK_LNG = 'zh-CN'
const STORAGE_KEY = 'matrix365_language'

function detectLanguage(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as string
      if (SUPPORTED_LNGS.includes(parsed as typeof SUPPORTED_LNGS[number])) return parsed
    }
  } catch {
    // ignore localStorage parse errors
  }

  const browserLangs = navigator.languages ?? [navigator.language]
  for (const lang of browserLangs) {
    if (SUPPORTED_LNGS.includes(lang as typeof SUPPORTED_LNGS[number])) return lang
    const prefix = lang.split('-')[0].toLowerCase()
    const match = SUPPORTED_LNGS.find(
      (s) => s.toLowerCase() === prefix || s.toLowerCase().startsWith(prefix + '-'),
    )
    if (match) return match
  }

  return FALLBACK_LNG
}

void i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
  lng: detectLanguage(),
  fallbackLng: FALLBACK_LNG,
  supportedLngs: [...SUPPORTED_LNGS],
  backend: {
    // 带版本号 cache-busting：locale JSON 是无 hash 指纹的静态文件，易被 nginx/CDN/浏览器缓存。
    // 每次发版 __APP_VERSION__（取自 package.json version）变化即绕过各级旧缓存，
    // 避免出现"新增翻译 key 在部分客户端显示为原始 key"的问题。
    loadPath: `/locales/{{lng}}/translation.json?v=${__APP_VERSION__}`,
  },
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
})

useUIStore.getState().setLanguage(i18n.language)

i18n.on('languageChanged', (lng) => {
  useUIStore.getState().setLanguage(lng)
})

export default i18n
