import type { LucideIcon } from 'lucide-react'
import {
  Flame,
  Image as ImageIcon,
  PenLine,
  Target,
  Megaphone,
  Music,
  Play,
  Globe,
  BookOpen,
  Lightbulb,
  Zap,
} from 'lucide-react'

export type ChatMode = 'agent' | 'fast'

export type Ability = {
  id: string
  label: string
  icon: LucideIcon
  prompt: string
  mode: ChatMode | 'both'
}

export const agentAbilities: Ability[] = [
  {
    id: 'publish-tk',
    label: '发布 TikTok',
    icon: Music,
    prompt: '请为 TikTok 平台生成一条短视频内容（含脚本、画面描述与字幕），主题是：',
    mode: 'agent',
  },
  {
    id: 'publish-yt',
    label: '发布 YouTube',
    icon: Play,
    prompt: '请为 YouTube 平台生成一条视频内容（含标题、开场、正文与 CTA），主题是：',
    mode: 'agent',
  },
  {
    id: 'publish-fb',
    label: '发布 Facebook',
    icon: Globe,
    prompt: '请为 Facebook 平台生成一条带图文案（控制 1-3 段，含 hashtag），主题是：',
    mode: 'agent',
  },
  {
    id: 'analyze-hot',
    label: '拆解爆款',
    icon: Flame,
    prompt: '请分析以下爆款内容的成功要素（开场、节奏、卖点、转化路径），并给出可复用的模板：',
    mode: 'agent',
  },
  {
    id: 'article-kb',
    label: '写文章入库',
    icon: BookOpen,
    prompt: '请基于知识库与企业档案撰写一篇文章，主题与要求：',
    mode: 'agent',
  },
  {
    id: 'inspire',
    label: '给我灵感',
    icon: Lightbulb,
    prompt: '基于我的品牌与产品，给我 5 个本周可发布的内容选题（含标题、形式、目标人群）：',
    mode: 'agent',
  },
]

export const fastAbilities: Ability[] = [
  {
    id: 'hot-video',
    label: '爆款短视频',
    icon: Flame,
    prompt: '生成一条 30 秒爆款短视频脚本，产品卖点是：',
    mode: 'fast',
  },
  {
    id: 'social-post',
    label: '社媒图文',
    icon: ImageIcon,
    prompt: '生成一段适合社媒的图文文案（短、强钩子、含 hashtag），主题：',
    mode: 'fast',
  },
  {
    id: 'seo-article',
    label: 'SEO 文章',
    icon: PenLine,
    prompt: '生成一篇 SEO 友好的文章（含标题、副标题、关键词布局），主题与目标关键词：',
    mode: 'fast',
  },
  {
    id: 'poster',
    label: '产品海报',
    icon: Megaphone,
    prompt: '生成一张产品海报的视觉描述与文案（主标、副标、CTA），产品与卖点：',
    mode: 'fast',
  },
  {
    id: 'golden-3s',
    label: '黄金 3 秒',
    icon: Zap,
    prompt: '为以下产品/选题生成 5 个黄金 3 秒开场（每个 1-2 句，强钩子）：',
    mode: 'fast',
  },
  {
    id: 'selling-angle',
    label: '卖点角度',
    icon: Target,
    prompt: '为以下产品分析 5 个差异化卖点角度（不要重复同质化卖点）：',
    mode: 'fast',
  },
]

export function getAbilitiesForMode(mode: ChatMode): Ability[] {
  return mode === 'agent' ? agentAbilities : fastAbilities
}

export const FAST_MODE_PROMPT_PREFIX = '[快速模式] 请精炼、直接给出结果，不要过多寒暄与对话。\n\n'
