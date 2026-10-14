/**
 * 国内分发平台代码表（与主站 frontend/src/utils/tlfPlatforms.ts 同源）。
 * 后台 Skill 池「适用平台」下拉用其 code↔中文名映射。
 */
export interface TlfPlatform {
  code: string
  name: string
  popular?: boolean
}

// 与主站 frontend/src/utils/tlfPlatforms.ts 同源：国内 19 个（popular 为当前展示集），
// 海外 = Composio 平台（managed 可用 5 个 + 自建 OAuth 的 X 共 6 个 popular，TikTok 暂未启用）。
export const TLF_PLATFORMS: TlfPlatform[] = [
  // ── 国内平台（灵径实际支持云端扫码绑定+发布的 19 个）──
  { code: 'DouYin', name: '抖音', popular: true },
  { code: 'KuaiShou', name: '快手', popular: true },
  { code: 'XiaoHongShu', name: '小红书', popular: true },
  { code: 'BiLiBiLi', name: '哔哩哔哩', popular: true },
  { code: 'BaiJiaHao', name: '百家号', popular: true },
  { code: 'TouTiaoHao', name: '头条号', popular: true },
  { code: 'XinLangWeiBo', name: '新浪微博', popular: true },
  { code: 'ShiPinHao', name: '微信视频号', popular: true },
  { code: 'ZhiHu', name: '知乎', popular: true },
  { code: 'WeiXinGongZhongHao', name: '微信公众号', popular: true },
  { code: 'DuoDuoShiPin', name: '多多视频', popular: true },
  { code: 'XueQiuHao', name: '雪球号' },
  { code: 'KuaiChuanHao', name: '快传号' },
  { code: 'ACFun', name: 'AcFun' },
  { code: 'YiCheHao', name: '易车号' },
  { code: 'MeiPai', name: '美拍' },
  { code: 'AiQiYi', name: '爱奇艺' },
  { code: 'SouHuShiPin', name: '搜狐视频' },
  { code: 'TengXunWeiShi', name: '腾讯微视' },
  // ── 海外平台（Composio OAuth；managed 可用 5 个 + 自建 OAuth 的 X 已启用）──
  { code: 'LinkedIn', name: 'LinkedIn', popular: true },
  { code: 'Facebook', name: 'Facebook', popular: true },
  { code: 'Instagram', name: 'Instagram', popular: true },
  { code: 'Reddit', name: 'Reddit', popular: true },
  { code: 'YouTube', name: 'YouTube', popular: true },
  { code: 'Twitter', name: 'Twitter / X', popular: true },
  // ── 海外保留（无 managed 凭证且未配置 OAuth app，TikTok 暂未启用）──
  { code: 'TikTok', name: 'TikTok' },
]

const TLF_PLATFORM_MAP: Record<string, TlfPlatform> = Object.fromEntries(
  TLF_PLATFORMS.map((p) => [p.code, p]),
)

/** code → 中文名；未知 code 原样返回。 */
export function getPlatformName(code: string): string {
  return TLF_PLATFORM_MAP[code]?.name ?? code
}
