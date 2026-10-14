/**
 * 国内分发平台代码表（按上游服务商 Platforms 枚举）。
 *
 * - code: API 中使用的 platformCode（大小写敏感）
 * - name: 中文显示名
 * - tone: PlatformBadge 色彩 token
 * - needsPassword: 云授权时**必须**提供社媒账号密码 ——
 *     上游文档只笼统说「部分平台需要」，未给清单；这里仅标记**已实测**确认需要的平台。
 *     未标记的不显示密码框；若某平台调用后返回 `502001 password not found`，再补 true。
 * - popular: 优先展示在下拉前列
 */
export interface TlfPlatform {
  code: string
  name: string
  tone: 'rose' | 'emerald' | 'sky' | 'amber' | 'primary'
  needsPassword?: boolean
  popular?: boolean
}

// 国内平台 = 灵径(lapi.cc)实际支持「云端扫码绑定 + 发布」的 19 个（与推量发开放接口文档 §5 一致）。
// popular 为当前展示的集合——未标 popular 的仍在表内（按 code 取名/着色）但 UI 不展示
// （getVisiblePlatforms 过滤）。
export const TLF_PLATFORMS: TlfPlatform[] = [
  // ── 主流（展示）──
  { code: 'DouYin',             name: '抖音',         tone: 'rose',    needsPassword: true, popular: true },
  { code: 'KuaiShou',           name: '快手',         tone: 'amber',   popular: true },
  { code: 'XiaoHongShu',        name: '小红书',       tone: 'rose',    popular: true },
  { code: 'BiLiBiLi',           name: '哔哩哔哩',     tone: 'sky',     popular: true },
  { code: 'BaiJiaHao',          name: '百家号',       tone: 'sky',     popular: true },
  { code: 'TouTiaoHao',         name: '头条号',       tone: 'rose',    popular: true },
  { code: 'XinLangWeiBo',       name: '新浪微博',     tone: 'rose',    popular: true },
  { code: 'ShiPinHao',          name: '微信视频号',   tone: 'emerald', popular: true },
  { code: 'ZhiHu',              name: '知乎',         tone: 'sky',     popular: true },
  { code: 'WeiXinGongZhongHao', name: '微信公众号',   tone: 'emerald', popular: true },
  { code: 'DuoDuoShiPin',       name: '多多视频',     tone: 'rose',    popular: true },
  // ── 暂不展示（保留映射）──
  { code: 'XueQiuHao',          name: '雪球号',       tone: 'emerald'},
  { code: 'KuaiChuanHao',       name: '快传号',       tone: 'amber'  },
  { code: 'ACFun',              name: 'AcFun',        tone: 'rose'   },
  { code: 'YiCheHao',           name: '易车号',       tone: 'rose'   },
  { code: 'MeiPai',             name: '美拍',         tone: 'rose'   },
  { code: 'AiQiYi',             name: '爱奇艺',       tone: 'emerald'},
  { code: 'SouHuShiPin',        name: '搜狐视频',     tone: 'rose'   },
  { code: 'TengXunWeiShi',      name: '腾讯微视',     tone: 'sky'    },
  // ── 海外平台（走 Composio OAuth 授权，无代理）──
  // managed 可用（Composio 托管凭证，一个 API key 即可）→ 已启用
  { code: 'LinkedIn',           name: 'LinkedIn',     tone: 'sky',     popular: true },
  { code: 'Facebook',           name: 'Facebook',     tone: 'sky',     popular: true },
  { code: 'Instagram',          name: 'Instagram',    tone: 'rose',    popular: true },
  { code: 'Reddit',             name: 'Reddit',       tone: 'amber',   popular: true },
  { code: 'YouTube',            name: 'YouTube',      tone: 'rose',    popular: true },
  // Composio 无 managed 凭证，须自建 OAuth app + 在网关 COMPOSIO_AUTH_CONFIG_IDS 登记 ac_id。
  // X/Twitter 已配置并启用；TikTok 暂未启用（未配置 OAuth app，授权会失败），故不标 popular
  { code: 'Twitter',            name: 'Twitter / X',  tone: 'sky',     popular: true },
  { code: 'TikTok',             name: 'TikTok',       tone: 'primary'},
]

/**
 * 海外平台（走 Composio OAuth 授权，无代理；与国内灵径平台区分）。
 * 须与后端 `services/platform_registry.py` 的 COMPOSIO_PLATFORMS 同源。
 */
export const OVERSEA_PLATFORMS = new Set([
  'Twitter', 'LinkedIn', 'Facebook', 'Instagram', 'TikTok', 'Reddit', 'YouTube',
])

export function isOverseaPlatform(code: string): boolean {
  return OVERSEA_PLATFORMS.has(code)
}

export const TLF_PLATFORM_MAP: Record<string, TlfPlatform> = Object.fromEntries(
  TLF_PLATFORMS.map((p) => [p.code, p]),
)

export function getPlatformByCode(code: string): TlfPlatform | undefined {
  return TLF_PLATFORM_MAP[code]
}

/**
 * 平台色调 → Tailwind class（**全站统一复用**：国内发布 PlatformBadge、创作大师下拉等）。
 * 与「内容类型语义色」同一套色系风格：rose / emerald / sky / amber / primary（紫）。
 * 新增需要平台徽标着色的地方，统一用 `platformToneClass(code)` 或 `<PlatformBadge>`，不要另写颜色。
 */
export const PLATFORM_TONE_CLASS: Record<TlfPlatform['tone'], string> = {
  rose: 'bg-rose-500/12 text-rose-600 border-rose-500/20 dark:text-rose-300',
  emerald: 'bg-emerald-500/12 text-emerald-600 border-emerald-500/20 dark:text-emerald-300',
  sky: 'bg-sky-500/12 text-sky-600 border-sky-500/20 dark:text-sky-300',
  amber: 'bg-amber-500/12 text-amber-700 border-amber-500/20 dark:text-amber-300',
  primary: 'bg-primary/12 text-primary border-primary/20',
}

/** 取某平台 code 的色调 class（未知平台回退 primary 紫）。 */
export function platformToneClass(code: string): string {
  return PLATFORM_TONE_CLASS[getPlatformByCode(code)?.tone ?? 'primary']
}

export function getPlatformName(code: string): string {
  return TLF_PLATFORM_MAP[code]?.name ?? code
}

/**
 * 当前对外可见的平台 —— 仅 popular。
 * 其他平台暂时在 UI 隐藏（接通过文档枚举不删除），后续要开放时把 popular 设为 true 即可。
 */
export function getVisiblePlatforms(): TlfPlatform[] {
  return TLF_PLATFORMS.filter((p) => p.popular)
}
