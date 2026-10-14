export const API_BASE = '/api/v1'

export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  KNOWLEDGE_COMPANIES: '/knowledge/companies',
  KNOWLEDGE_BRANDS: '/knowledge/brands',
  KNOWLEDGE_PRODUCTS: '/knowledge/products',
  KNOWLEDGE_CUSTOMERS: '/knowledge/customers',
  KNOWLEDGE_CASES: '/knowledge/cases',
  KNOWLEDGE_SEARCH: '/knowledge/search',
  KNOWLEDGE_FINDER: '/knowledge/finder',
  DOCUMENTS: '/documents',
  MEDIA_IMAGES: '/media/images',
  MEDIA_VIDEOS: '/media/videos',
  MEDIA_AUDIOS: '/media/audios',
  CHAT: '/chat',
  GENERATION_ARTICLE: '/generation/article',
  GENERATION_IMAGE: '/generation/image',
  GENERATION_VIDEO: '/generation/video',
  GENERATION_LIBRARY: '/generation/library',
  GENERATION_AUTO_SCHEDULE: '/generation/auto-schedule',
  SETTINGS: '/settings',
  PRICING: '/pricing',
  ACCOUNT_SUBSCRIPTION: '/account/subscription',
  ACCOUNT_BILLING_DETAILS: '/account/billing-details',
  ACCOUNT_NOTIFICATIONS: '/account/notifications',
  FEEDBACK: '/feedback',
  REFERRAL: '/referral',
} as const

export const FILE_LIMITS = {
  IMAGE_MAX_SIZE: 20 * 1024 * 1024,
  VIDEO_MAX_SIZE: 100 * 1024 * 1024,
  DOCUMENT_MAX_SIZE: 50 * 1024 * 1024,
} as const

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
export const ALLOWED_DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.docx', '.doc',
  '.xlsx', '.xls',
  '.pptx', '.ppt',
  '.txt', '.csv', '.md',
  '.html', '.htm',
  '.epub', '.rtf', '.odt',
]

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', label: '简体中文', short: '中文', flag: '🇨🇳', dir: 'ltr' },
  { code: 'en',    label: 'English',  short: 'EN',   flag: '🇺🇸', dir: 'ltr' },
  { code: 'ko',    label: '한국어',   short: 'KO',   flag: '🇰🇷', dir: 'ltr' },
  { code: 'ja',    label: '日本語',   short: 'JA',   flag: '🇯🇵', dir: 'ltr' },
  { code: 'fr',    label: 'Français', short: 'FR',   flag: '🇫🇷', dir: 'ltr' },
  { code: 'es',    label: 'Español',  short: 'ES',   flag: '🇪🇸', dir: 'ltr' },
] as const
