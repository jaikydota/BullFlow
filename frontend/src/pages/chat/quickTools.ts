import type { LucideIcon } from 'lucide-react'
import { Film, Image as ImageIcon, PenTool, Megaphone, BarChart3 } from 'lucide-react'
import type { IconBoxAccent } from '@/components/shared'

export type QuickTool = {
  id: string
  title: string
  desc: string
  icon: LucideIcon
  accent: IconBoxAccent
  /** 路由跳转优先；无则用 prompt 预填到 ChatComposer */
  to?: string
  prompt?: string
}

export const quickTools: QuickTool[] = [
  {
    id: 'video',
    title: '视频制作',
    desc: '带货视频 / 口播 / 短视频脚本',
    icon: Film,
    accent: 'video',
    to: '/generation/video',
  },
  {
    id: 'image',
    title: '图文生成',
    desc: '多图 / 海报 / 图文动态',
    icon: ImageIcon,
    accent: 'image',
    to: '/generation/image',
  },
  {
    id: 'article',
    title: '文章创作',
    desc: 'SEO 文 / 公众号 / 长文带稿',
    icon: PenTool,
    accent: 'article',
    to: '/generation/article',
  },
  {
    id: 'poster',
    title: '营销文案',
    desc: '黄金 3 秒 / 卖点 / 短文案',
    icon: Megaphone,
    accent: 'rose',
    prompt: '请为我生成一组营销文案（黄金 3 秒、卖点、CTA），目标产品与场景：',
  },
  {
    id: 'analytics',
    title: '内容分析',
    desc: '拆解爆款 / 优化建议',
    icon: BarChart3,
    accent: 'info',
    prompt: '请帮我分析以下内容的爆款要素，并给出可复用的优化建议：',
  },
]
