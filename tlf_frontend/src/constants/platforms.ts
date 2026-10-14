/**
 * 灵径平台 code → 中文名映射（与 tlf_backend/tlf_app/services/publish_spec.py 的 PUBLISH_SPEC keys 对齐）。
 * 用于下拉过滤 + 表格展示。
 */
export const PLATFORM_NAMES: Record<string, string> = {
  DouYin: '抖音',
  XiaoHongShu: '小红书',
  KuaiShou: '快手',
  BiLiBiLi: '哔哩哔哩',
  ShiPinHao: '微信视频号',
  WeiXinGongZhongHao: '微信公众号',
  XinLangWeiBo: '新浪微博',
  ZhiHu: '知乎',
  TouTiaoHao: '头条号',
  BaiJiaHao: '百家号',
  DaYuHao: '大鱼号',
  WangYiHao: '网易号',
  SouHuHao: '搜狐号',
  QiEHao: '企鹅号',
  YiDianHao: '一点号',
  XueQiuHao: '雪球号',
  KuaiChuanHao: '快传号',
  AiQiYi: '爱奇艺',
  TengXunShiPin: '腾讯视频',
  TengXunWeiShi: '腾讯微视',
  SouHuShiPin: '搜狐视频',
  PiPiXia: '皮皮虾',
  DuoDuoShiPin: '多多视频',
  MeiPai: '美拍',
  ACFun: 'AcFun',
  DaYuHaoVideo: '大鱼号视频',
  SouHuHaoVideo: '搜狐号视频',
  BiliBiliComic: '哔哩哔哩漫画',
  CheJiaHao: '车家号',
  YiCheHao: '易车号',
  FengWang: '蜂网',
  DeWu: '得物',
  MeiYou: '美柚',
  XiaoHongShuShangJiaHao: '小红书商家号',
  DouBan: '豆瓣',
  JianShu: '简书',
  CSDN: 'CSDN',
  WiFiWanNengYaoShi: 'Wifi万能钥匙',
  // ── 海外（Composio OAuth；与 tlf_backend services/platform_registry.py 同源）──
  Twitter: 'X / Twitter',
  LinkedIn: 'LinkedIn',
  Facebook: 'Facebook',
  Instagram: 'Instagram',
  Reddit: 'Reddit',
  YouTube: 'YouTube',
  TikTok: 'TikTok',
}

/** 平台名（带 code）：抖音 (DouYin)；未知 code 原样返回 */
export function platformLabel(code: string | null | undefined): string {
  if (!code) return '-'
  const name = PLATFORM_NAMES[code]
  return name ? `${name}` : code
}

/** AntD Select options（按中文名展示，value 为 code） */
export const PLATFORM_OPTIONS = Object.entries(PLATFORM_NAMES).map(([value, label]) => ({
  value,
  label: `${label} (${value})`,
}))
