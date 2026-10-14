/**
 * 国内分发平台发布规范（单一事实来源）。
 *
 * 来源：灵径推送任务接口规范（全 38 平台 × 多发布类型 × 字段级约束）。
 * 后端镜像在 backend/app/services/tlf_publish_spec.py；两端必须保持一致，
 * 通过 backend/tests/test_publish_spec.py 单元测试断言。
 *
 * - PlatformConstraint：单个平台的约束（按 publish_type 三分）
 * - PublishKindSpec：单种发布类型下的全部字段约束
 * - MediaSpec：媒体类字段（image / video / cover）扩展约束（大小 / 分辨率 / 时长）
 * - EnumOption：枚举字段（visibleType / statement / createType）的可选值
 */
export type PublishKind = 'video' | 'article' | 'dynamic'

export interface FieldRange {
  required?: boolean
  min?: number
  max?: number
  note?: string
}

export interface EnumOption {
  value: number | string
  label: string
}

export interface MediaSpec extends FieldRange {
  /** 单张图片 / 单视频上限（MB） */
  maxFileSizeMB?: number
  /** 最小宽度（像素） */
  minWidth?: number
  /** 最小高度（像素） */
  minHeight?: number
  /** 视频专属：时长上限（秒） */
  maxDurationSeconds?: number
}

export interface TagsSpec extends FieldRange {
  /** 单条 tag 的字符上限 */
  itemMaxLength?: number
}

export interface PublishKindSpec {
  title?: FieldRange
  /** 动态 / 视频用的简介 */
  desc?: FieldRange
  /** 文章 HTML 正文 */
  content?: FieldRange
  images?: MediaSpec
  covers?: MediaSpec
  video?: MediaSpec
  /** 标签（如 B 站标签，每条最大 N 字） */
  tags?: TagsSpec
  /** desc / content 中允许的最大话题数（#xxx#） */
  hashtagMax?: number
  /** 可见性枚举（每平台 0/1/3 等取值差异）；未声明时不显示该字段 */
  visibleType?: EnumOption[]
  /** 创作申明枚举（每平台 enum 不同）；未声明不显示 */
  statement?: EnumOption[]
  /** 定时发布时间窗口（最早 N 小时后 / 最晚 M 天内）；未声明不支持定时 */
  prePubTime?: { minHours: number; maxDays: number }
  /** 占位（UI 不展示，仅供后端透传） */
  category?: { required: boolean }
  subCategory?: { required: boolean }
  createType?: EnumOption[]
}

export interface PlatformConstraint {
  supports?: PublishKind[]
  video?: PublishKindSpec
  article?: PublishKindSpec
  dynamic?: PublishKindSpec
}

/* ──────────────── 批量设置文案常量（多平台 step3 UI 用） ────────────────
   参考灵径官方批量设置 UI；"不支持/支持" 文案与其保持一致。注意：列表里某些平台
   （如快手-Open、哔哩哔哩-Open）本系统未接入，仅作为信息性提示列出，
   不会影响实际发布逻辑。 */

export const BATCH_SETTING_HINTS = {
  schedule: {
    unsupported: '海外平台、快手-Open、哔哩哔哩-Open、皮皮虾、搜狐视频、搜狐号、得物',
    footnote: '新浪微博：仅微博会员和企业号支持定时发布',
  },
  original: {
    supported: '视频号、小红书、哔哩哔哩 等 11 个平台',
    tooltip: '视频号、小红书、哔哩哔哩、哔哩哔哩-Open、新浪微博、知乎、大鱼号、网易号、爱奇艺、AcFun、车家号',
  },
  ai: {
    supported: '抖音、快手、小红书 等 17 个平台',
    tooltip: '抖音、快手、小红书、哔哩哔哩、百家号、头条号、知乎、搜狐号、一点号、大鱼号、网易号、爱奇艺、搜狐视频、腾讯视频、多多视频、得物、易车号',
  },
  private: {
    unsupported: '皮皮虾、多多视频、美拍、AcFun、易车号、美柚',
  },
} as const

/* ──────────────── 通用 enum 预设 ──────────────── */

/** 多数平台共用的「公开/私密/好友可见」三态 */
export const VISIBLE_PUBLIC_PRIVATE_FRIENDS: EnumOption[] = [
  { value: 0, label: '公开' },
  { value: 1, label: '私密' },
  { value: 3, label: '好友可见' },
]

/** 仅「公开/私密」两态 */
export const VISIBLE_PUBLIC_PRIVATE: EnumOption[] = [
  { value: 0, label: '公开' },
  { value: 1, label: '私密' },
]

/* ──────────────── 38 平台规范 ──────────────── */

export const TLF_PLATFORM_CONSTRAINTS: Record<string, PlatformConstraint> = {
  /* ========== 抖音 DouYin ========== */
  DouYin: {
    supports: ['video', 'article', 'dynamic'],
    video: {
      title: { required: true, max: 30 },
      desc: { required: true, max: 1000 },
      video: { required: true, maxFileSizeMB: 16 * 1024, maxDurationSeconds: 60 * 60 },
      covers: { required: true, min: 1, note: '至少 1 张视频封面' },
      hashtagMax: 5,
      visibleType: VISIBLE_PUBLIC_PRIVATE_FRIENDS,
      statement: [
        { value: 3, label: 'AI 生成' },
        { value: 4, label: '引人不适' },
        { value: 5, label: '虚构演绎' },
        { value: 6, label: '危险行为' },
        { value: 7, label: '个人观点' },
        { value: 8, label: '营销内容' },
      ],
      prePubTime: { minHours: 2, maxDays: 14 },
    },
    article: {
      title: { required: true, max: 30 },
      desc: { max: 30 },
      content: { required: true, max: 8000, note: 'HTML 格式' },
      covers: { required: true, min: 1, max: 1, maxFileSizeMB: 50 },
      hashtagMax: 5,
      visibleType: VISIBLE_PUBLIC_PRIVATE_FRIENDS,
      prePubTime: { minHours: 2, maxDays: 14 },
    },
    dynamic: {
      title: { required: true, max: 20 },
      desc: { required: true, max: 1000 },
      images: { required: true, min: 1, max: 35, maxFileSizeMB: 50, note: '至少 1 张图片' },
      covers: { required: true, min: 1, note: '动态图文需 1 张封面' },
      hashtagMax: 5,
      visibleType: VISIBLE_PUBLIC_PRIVATE_FRIENDS,
      statement: [
        { value: 3, label: 'AI 生成' },
        { value: 4, label: '引人不适' },
        { value: 5, label: '虚构演绎' },
        { value: 6, label: '危险行为' },
        { value: 7, label: '个人观点' },
        { value: 8, label: '营销内容' },
      ],
      prePubTime: { minHours: 2, maxDays: 14 },
    },
  },

  /* ========== 小红书 XiaoHongShu ========== */
  XiaoHongShu: {
    supports: ['video', 'dynamic'],
    video: {
      title: { required: true, max: 20 },
      desc: { required: true, max: 1000 },
      video: { required: true, maxFileSizeMB: 20 * 1024, maxDurationSeconds: 60 * 60 },
      covers: { required: true, min: 1 },
      visibleType: VISIBLE_PUBLIC_PRIVATE_FRIENDS,
      statement: [
        { value: 1, label: '虚构演绎' },
        { value: 2, label: '含 AI 元素' },
        { value: 3, label: '自主标注' },
        { value: 4, label: '自拍' },
        { value: 5, label: '转载' },
      ],
      prePubTime: { minHours: 1, maxDays: 14 },
    },
    dynamic: {
      title: { required: true, max: 20 },
      desc: { required: true, max: 1000 },
      images: { required: true, min: 1, max: 18, maxFileSizeMB: 20, note: '小红书必须至少 1 张图片' },
      hashtagMax: 10,
      visibleType: VISIBLE_PUBLIC_PRIVATE_FRIENDS,
      statement: [
        { value: 1, label: '虚构演绎' },
        { value: 2, label: '含 AI 元素' },
        { value: 3, label: '自主标注' },
        { value: 4, label: '自拍' },
        { value: 5, label: '转载' },
      ],
      prePubTime: { minHours: 1, maxDays: 14 },
    },
  },

  /* ========== 快手 KuaiShou ========== */
  KuaiShou: {
    supports: ['video', 'dynamic'],
    video: {
      title: { max: 30 },
      desc: { required: true, max: 500 },
      video: { required: true, maxFileSizeMB: 8 * 1024, maxDurationSeconds: 30 * 60 },
      covers: { required: true, min: 1 },
      visibleType: VISIBLE_PUBLIC_PRIVATE_FRIENDS,
      statement: [
        { value: 1, label: 'AI 生成' },
        { value: 2, label: '演绎' },
        { value: 3, label: '个人观点' },
      ],
      prePubTime: { minHours: 1, maxDays: 14 },
    },
    dynamic: {
      desc: { required: true, max: 500 },
      images: { required: true, min: 1, max: 31, maxFileSizeMB: 15 },
      covers: { required: true, min: 1 },
      hashtagMax: 4,
      visibleType: VISIBLE_PUBLIC_PRIVATE_FRIENDS,
      statement: [
        { value: 1, label: 'AI 生成' },
        { value: 2, label: '演绎' },
        { value: 3, label: '个人观点' },
      ],
      prePubTime: { minHours: 1, maxDays: 14 },
    },
  },

  /* ========== 哔哩哔哩 BiLiBiLi ========== */
  BiLiBiLi: {
    supports: ['video', 'article'],
    video: {
      title: { required: true, min: 1, max: 80 },
      desc: { required: true, max: 2000 },
      video: { required: true, maxFileSizeMB: 16 * 1024, maxDurationSeconds: 10 * 60 * 60 },
      covers: { required: true, min: 1, maxFileSizeMB: 5 },
      tags: { required: true, min: 1, max: 10, itemMaxLength: 20 },
      statement: [
        { value: 1, label: 'AI 合成' },
        { value: 2, label: '危险行为' },
        { value: 3, label: '娱乐效果' },
        { value: 4, label: '引人不适' },
        { value: 5, label: '消费提示' },
        { value: 6, label: '个人观点' },
      ],
      createType: [
        { value: 1, label: '自制' },
        { value: 2, label: '转载' },
      ],
      prePubTime: { minHours: 2, maxDays: 15 },
    },
    article: {
      title: { required: true, min: 9, max: 100 },
      content: { required: true, max: 20000, note: 'HTML 格式' },
      covers: { minWidth: 160, minHeight: 160, maxFileSizeMB: 10 },
      tags: { max: 10, itemMaxLength: 20 },
      createType: [
        { value: 0, label: '不申明' },
        { value: 1, label: '原创' },
      ],
      prePubTime: { minHours: 2, maxDays: 7 },
    },
  },

  /* ========== 微信视频号 ShiPinHao ========== */
  ShiPinHao: {
    supports: ['video', 'dynamic'],
    video: {
      title: { required: true, max: 20 },
      desc: { required: true, max: 1000 },
      video: { required: true, maxFileSizeMB: 512, maxDurationSeconds: 15 * 60 },
      covers: { required: true, min: 1 },
      prePubTime: { minHours: 2, maxDays: 30 },
    },
    dynamic: {
      title: { required: true, max: 22 },
      desc: { required: true, max: 1000 },
      images: { required: true, min: 1, max: 18, maxFileSizeMB: 0.5, note: '每张图片 ≤ 512KB' },
      prePubTime: { minHours: 2, maxDays: 30 },
    },
  },

  /* ========== 微信公众号 WeiXinGongZhongHao ========== */
  WeiXinGongZhongHao: {
    supports: ['article'],
    article: {
      title: { required: true, max: 64 },
      desc: { max: 129, note: '摘要，每篇最多 129 字' },
      content: { required: true, note: 'HTML 格式；支持自定义 account-card / video-card 标签' },
      covers: { required: true, min: 1 },
      createType: [
        { value: 0, label: '不申明' },
        { value: 1, label: '原创' },
      ],
      prePubTime: { minHours: 2, maxDays: 7 },
    },
  },

  /* ========== 新浪微博 XinLangWeiBo ========== */
  XinLangWeiBo: {
    supports: ['video', 'article', 'dynamic'],
    video: {
      title: { required: true, max: 20 },
      desc: { required: true, max: 500 },
      video: { required: true, maxFileSizeMB: 8 * 1024, maxDurationSeconds: 30 * 60 },
      covers: { required: true, min: 1 },
      prePubTime: { minHours: 2, maxDays: 15 },
    },
    article: {
      title: { required: true, min: 1, max: 32 },
      content: { required: true, max: 10000, note: 'HTML 格式' },
      covers: { required: true, min: 1, maxFileSizeMB: 20 },
    },
    dynamic: {
      desc: { required: true, max: 500 },
      images: { max: 18, maxFileSizeMB: 20 },
      statement: [
        { value: 1, label: 'AI 生成' },
        { value: 2, label: '个人观点' },
      ],
    },
  },

  /* ========== 知乎 ZhiHu ========== */
  ZhiHu: {
    supports: ['article', 'dynamic'],
    article: {
      title: { required: true, min: 9, max: 100 },
      content: { required: true, min: 9, max: 10000, note: 'HTML 格式' },
      covers: { maxFileSizeMB: 10 },
      tags: { max: 3, itemMaxLength: 14, note: '话题；来自话题搜索接口' },
      statement: [
        { value: 1, label: '包含剧透' },
        { value: 2, label: '医疗建议' },
        { value: 3, label: '虚构' },
        { value: 4, label: '理财内容' },
        { value: 5, label: 'AI 辅助' },
      ],
    },
    dynamic: {
      title: { max: 50 },
      desc: { required: true, max: 500 },
      images: { max: 9, maxFileSizeMB: 10 },
      hashtagMax: 4,
    },
  },

  /* ========== 头条号 TouTiaoHao ========== */
  TouTiaoHao: {
    supports: ['video', 'article', 'dynamic'],
    video: {
      title: { required: true, max: 30 },
      desc: { required: true, max: 500 },
      video: { required: true, maxFileSizeMB: 4 * 1024, maxDurationSeconds: 60 * 60 },
      covers: { required: true, min: 1, minWidth: 372, minHeight: 248 },
      statement: [
        { value: 1, label: '取材网络' },
        { value: 2, label: '个人观点' },
        { value: 3, label: 'AI 生成' },
        { value: 6, label: '虚构' },
        { value: 7, label: '投资观点' },
        { value: 8, label: '医疗建议' },
      ],
      prePubTime: { minHours: 2, maxDays: 7 },
    },
    article: {
      title: { required: true, min: 2, max: 30 },
      content: { required: true, min: 1, max: 20000, note: 'HTML 格式' },
      covers: { required: true, min: 1, minWidth: 372, minHeight: 248, maxFileSizeMB: 20 },
      statement: [
        { value: 1, label: '取材网络' },
        { value: 2, label: '个人观点' },
        { value: 3, label: 'AI 生成' },
        { value: 6, label: '虚构' },
        { value: 7, label: '投资观点' },
        { value: 8, label: '医疗建议' },
      ],
      prePubTime: { minHours: 2, maxDays: 7 },
    },
    dynamic: {
      desc: { required: true, max: 500 },
      images: { max: 18, maxFileSizeMB: 15 },
      hashtagMax: 4,
    },
  },

  /* ========== 百家号 BaiJiaHao ========== */
  BaiJiaHao: {
    supports: ['video', 'article', 'dynamic'],
    video: {
      title: { max: 20 },
      desc: { required: true, max: 500 },
      video: { required: true, maxFileSizeMB: 4 * 1024, maxDurationSeconds: 30 * 60 },
      covers: { required: true, min: 1, maxFileSizeMB: 5 },
      statement: [
        { value: 0, label: '不声明' },
        { value: 1, label: 'AI 生成' },
      ],
      prePubTime: { minHours: 2, maxDays: 7 },
    },
    article: {
      title: { required: true, min: 2, max: 30 },
      content: { required: true, min: 9, max: 10000, note: 'HTML 格式' },
      covers: { required: true, min: 1, max: 3, minWidth: 372, minHeight: 248, maxFileSizeMB: 5 },
      statement: [
        { value: 0, label: '不声明' },
        { value: 1, label: 'AI 生成' },
      ],
      category: { required: true },
      subCategory: { required: true },
      prePubTime: { minHours: 1, maxDays: 7 },
    },
    dynamic: {
      title: { max: 20 },
      desc: { required: true, max: 2000 },
      images: { required: true, min: 1, max: 18, maxFileSizeMB: 20 },
      covers: { required: true, min: 1, maxFileSizeMB: 5 },
    },
  },

  /* ========== 大鱼号 DaYuHao ========== */
  DaYuHao: {
    supports: ['video', 'article'],
    video: {
      title: { required: true, max: 20 },
      desc: { required: true, max: 500 },
      video: { required: true, maxFileSizeMB: 4 * 1024, maxDurationSeconds: 30 * 60 },
      covers: { required: true, min: 1 },
      prePubTime: { minHours: 2, maxDays: 7 },
    },
    article: {
      title: { required: true, min: 5, max: 50 },
      content: { required: true, min: 9, max: 20000, note: 'HTML 格式' },
      covers: { min: 1, minWidth: 200, minHeight: 96 },
      statement: [
        { value: 0, label: '无申明' },
        { value: 3, label: '虚构' },
        { value: 4, label: 'AI 生成' },
      ],
      prePubTime: { minHours: 2, maxDays: 7 },
    },
  },

  /* ========== 网易号 WangYiHao ========== */
  WangYiHao: {
    supports: ['video', 'article'],
    video: {
      title: { max: 20 },
      desc: { required: true, max: 500 },
      video: { required: true, maxFileSizeMB: 8 * 1024, maxDurationSeconds: 30 * 60 },
      covers: { required: true, min: 1 },
      statement: [
        { value: 1, label: 'AI 生成' },
        { value: 2, label: '个人观点' },
        { value: 3, label: '网络取材' },
        { value: 4, label: '虚构' },
      ],
      prePubTime: { minHours: 2, maxDays: 7 },
    },
    article: {
      title: { required: true, min: 5, max: 30 },
      content: { required: true, max: 20000, note: 'HTML 格式' },
      covers: { required: true, min: 1, minWidth: 160, minHeight: 160, maxFileSizeMB: 10 },
      statement: [
        { value: 1, label: 'AI 生成' },
        { value: 2, label: '个人观点' },
        { value: 3, label: '网络取材' },
        { value: 4, label: '虚构' },
      ],
      createType: [
        { value: 0, label: '不勾选' },
        { value: 1, label: '勾选原创' },
      ],
      prePubTime: { minHours: 2, maxDays: 7 },
    },
  },

  /* ========== 搜狐号 SouHuHao ========== */
  SouHuHao: {
    supports: ['video', 'article'],
    video: {
      title: { required: true, max: 20 },
      desc: { required: true, max: 500 },
      video: { required: true, maxFileSizeMB: 8 * 1024, maxDurationSeconds: 30 * 60 },
      covers: { required: true, min: 1 },
      prePubTime: { minHours: 0.5, maxDays: 4 },
    },
    article: {
      title: { required: true, min: 5, max: 72 },
      desc: { required: true, min: 5, max: 200 },
      content: { required: true, max: 20000, note: 'HTML 格式' },
      covers: { required: true, min: 1, maxFileSizeMB: 10 },
      statement: [
        { value: 0, label: '无声明' },
        { value: 3, label: 'AI 内容' },
        { value: 4, label: '虚构' },
      ],
      prePubTime: { minHours: 0.5, maxDays: 4 },
    },
  },

  /* ========== 企鹅号 QiEHao ========== */
  QiEHao: {
    supports: ['video', 'article'],
    video: {
      title: { required: true, max: 20 },
      desc: { required: true, max: 500 },
      video: { required: true, maxFileSizeMB: 8 * 1024, maxDurationSeconds: 30 * 60 },
      covers: { required: true, min: 1 },
      prePubTime: { minHours: 4, maxDays: 7 },
    },
    article: {
      title: { required: true, min: 5, max: 64 },
      content: { required: true, max: 20000, note: 'HTML 格式' },
      covers: { maxFileSizeMB: 20 },
      tags: { max: 9, itemMaxLength: 8 },
      statement: [
        { value: 0, label: '不申明' },
        { value: 1, label: 'AI 生成' },
        { value: 2, label: '个人观点' },
        { value: 3, label: '演绎' },
        { value: 7, label: 'AI 辅助' },
        { value: 8, label: '医疗' },
        { value: 9, label: '危险' },
      ],
      prePubTime: { minHours: 4, maxDays: 7 },
    },
  },

  /* ========== 一点号 YiDianHao ========== */
  YiDianHao: {
    supports: ['video', 'article'],
    video: {
      title: { required: true, max: 20 },
      desc: { required: true, max: 1000 },
      video: { required: true, maxFileSizeMB: 8 * 1024, maxDurationSeconds: 30 * 60 },
      covers: { required: true, min: 1 },
      prePubTime: { minHours: 3, maxDays: 7 },
    },
    article: {
      title: { required: true, min: 5, max: 64 },
      content: { required: true, max: 20000, note: 'HTML 格式' },
      covers: { required: true, min: 1, maxFileSizeMB: 6 },
      statement: [
        { value: 3, label: '网络取材' },
        { value: 4, label: 'AI 生成' },
        { value: 5, label: '虚构' },
      ],
      prePubTime: { minHours: 3, maxDays: 7 },
    },
  },

  /* ========== 雪球号 XueQiuHao ========== */
  XueQiuHao: {
    supports: ['article'],
    article: {
      title: { required: true, max: 64 },
      content: { required: true, max: 20000, note: 'HTML 格式' },
      covers: { maxFileSizeMB: 10 },
    },
  },

  /* ========== 快传号 KuaiChuanHao ========== */
  KuaiChuanHao: {
    supports: ['article'],
    article: {
      title: { required: true, max: 64 },
      content: { required: true, max: 20000, note: 'HTML 格式' },
      covers: { maxFileSizeMB: 10 },
    },
  },

  /* ========== 爱奇艺 AiQiYi ========== */
  AiQiYi: {
    supports: ['video', 'article'],
    video: {
      title: { required: true, max: 30 },
      desc: { required: true, max: 500 },
      video: { required: true, maxFileSizeMB: 1024, maxDurationSeconds: 10 * 60 },
      covers: { required: true, min: 1, minWidth: 440, minHeight: 248 },
      tags: { max: 5 },
    },
    article: {
      title: { required: true, min: 5, max: 60 },
      content: { required: true, max: 20000, note: 'HTML 格式' },
    },
  },

  /* ========== 腾讯视频 TengXunShiPin ========== */
  TengXunShiPin: {
    supports: ['video'],
    video: {
      title: { required: true, max: 40 },
      desc: { max: 500 },
      video: { required: true, maxFileSizeMB: 8 * 1024, maxDurationSeconds: 60 * 60 },
      covers: { required: true, min: 1 },
      tags: { required: true, max: 20 },
    },
  },

  /* ========== 腾讯微视 TengXunWeiShi ========== */
  TengXunWeiShi: {
    supports: ['video'],
    video: {
      title: { required: true, max: 30 },
      desc: { max: 500 },
      video: { required: true, maxFileSizeMB: 512, maxDurationSeconds: 15 * 60 },
      covers: { required: true, min: 1 },
    },
  },

  /* ========== 搜狐视频 SouHuShiPin ========== */
  SouHuShiPin: {
    supports: ['video'],
    video: {
      title: { required: true, max: 30 },
      desc: { max: 500 },
      video: { required: true, maxFileSizeMB: 8 * 1024, maxDurationSeconds: 60 * 60 },
      covers: { required: true, min: 1 },
    },
  },

  /* ========== 皮皮虾 PiPiXia ========== */
  PiPiXia: {
    supports: ['video'],
    video: {
      title: { required: true, max: 30 },
      desc: { max: 500 },
      video: { required: true, maxFileSizeMB: 500, maxDurationSeconds: 15 * 60 },
      covers: { required: true, min: 1 },
    },
  },

  /* ========== 多多视频 DuoDuoShiPin ========== */
  DuoDuoShiPin: {
    supports: ['video'],
    video: {
      title: { required: true, max: 30 },
      desc: { max: 500 },
      video: { required: true, maxFileSizeMB: 1024, maxDurationSeconds: 15 * 60 },
      covers: { required: true, min: 1 },
    },
  },

  /* ========== 美拍 MeiPai ========== */
  MeiPai: {
    supports: ['video'],
    video: {
      title: { required: true, max: 30 },
      desc: { max: 500 },
      video: { required: true, maxFileSizeMB: 500, maxDurationSeconds: 15 * 60 },
      covers: { required: true, min: 1 },
    },
  },

  /* ========== AcFun ACFun ========== */
  ACFun: {
    supports: ['article'],
    article: {
      title: { required: true, min: 1, max: 50 },
      content: { required: true, max: 20000, note: 'HTML 格式' },
      covers: { required: true, min: 1, minWidth: 160, minHeight: 160, maxFileSizeMB: 10 },
      tags: { max: 1, note: '最多 1 个话题标签' },
      category: { required: true },
      subCategory: { required: true },
      createType: [
        { value: 0, label: '不申明' },
        { value: 1, label: '申明原创' },
      ],
    },
  },

  /* ========== 大鱼号视频 DaYuHaoVideo ========== */
  DaYuHaoVideo: {
    supports: ['video'],
    video: {
      title: { required: true, max: 20 },
      desc: { required: true, max: 500 },
      video: { required: true, maxFileSizeMB: 4 * 1024, maxDurationSeconds: 30 * 60 },
      covers: { required: true, min: 1 },
      prePubTime: { minHours: 2, maxDays: 7 },
    },
  },

  /* ========== 搜狐号视频 SouHuHaoVideo ========== */
  SouHuHaoVideo: {
    supports: ['video'],
    video: {
      title: { required: true, max: 20 },
      desc: { required: true, max: 500 },
      video: { required: true, maxFileSizeMB: 8 * 1024, maxDurationSeconds: 30 * 60 },
      covers: { required: true, min: 1 },
      prePubTime: { minHours: 0.5, maxDays: 4 },
    },
  },

  /* ========== 哔哩哔哩漫画 BiliBiliComic ========== */
  BiliBiliComic: {
    supports: ['article'],
    article: {
      title: { required: true, min: 1, max: 100 },
      content: { required: true, max: 20000, note: 'HTML 格式' },
      covers: { min: 1, minWidth: 160, minHeight: 160, maxFileSizeMB: 10 },
    },
  },

  /* ========== 车家号 CheJiaHao ========== */
  CheJiaHao: {
    supports: ['video', 'article'],
    video: {
      title: { required: true, max: 30 },
      desc: { required: true, max: 500 },
      video: { required: true, maxFileSizeMB: 8 * 1024, maxDurationSeconds: 30 * 60 },
      covers: { required: true, min: 1 },
    },
    article: {
      title: { required: true, min: 6, max: 30 },
      content: { required: true, max: 20000, note: 'HTML 格式；<div> 包裹' },
      covers: { required: true, note: '支持 1/3 封面；4:3 横版' },
      createType: [
        { value: 1, label: '原创' },
        { value: 3, label: '首发' },
        { value: 13, label: '原创首发' },
      ],
      prePubTime: { minHours: 0.5, maxDays: 15 },
    },
  },

  /* ========== 易车号 YiCheHao ========== */
  YiCheHao: {
    supports: ['article'],
    article: {
      title: { required: true, min: 1, max: 28 },
      content: { required: true, note: 'HTML 格式；<div> 包裹' },
      covers: { maxFileSizeMB: 10, note: '支持单封面 / 三封面' },
      statement: [
        { value: 0, label: '无申明' },
        { value: 1, label: '个人观点' },
        { value: 2, label: '网络' },
        { value: 3, label: 'AI 生成' },
        { value: 4, label: '引用' },
      ],
      prePubTime: { minHours: 1, maxDays: 7 },
    },
  },

  /* ========== 蜂网 FengWang ========== */
  FengWang: {
    supports: ['video'],
    video: {
      title: { required: true, max: 30 },
      desc: { max: 500 },
      video: { required: true, maxFileSizeMB: 500, maxDurationSeconds: 15 * 60 },
      covers: { required: true, min: 1 },
    },
  },

  /* ========== 得物 DeWu ========== */
  DeWu: {
    supports: ['video'],
    video: {
      title: { required: true, max: 30 },
      desc: { max: 500 },
      video: { required: true, maxFileSizeMB: 200, maxDurationSeconds: 30 },
      covers: { required: true, min: 1 },
    },
  },

  /* ========== 美柚 MeiYou ========== */
  MeiYou: {
    supports: ['video'],
    video: {
      title: { required: true, max: 30 },
      desc: { max: 500 },
      video: { required: true, maxFileSizeMB: 2 * 1024, maxDurationSeconds: 30 * 60 },
      covers: { required: true, min: 1 },
    },
  },

  /* ========== 小红书商家号 XiaoHongShuShangJiaHao ========== */
  XiaoHongShuShangJiaHao: {
    supports: ['video'],
    video: {
      title: { max: 20 },
      desc: { required: true, max: 1000 },
      video: { required: true, maxFileSizeMB: 8 * 1024, maxDurationSeconds: 15 * 60 },
      covers: { required: true, min: 1 },
      visibleType: VISIBLE_PUBLIC_PRIVATE,
      prePubTime: { minHours: 1, maxDays: 14 },
    },
  },

  /* ========== 豆瓣 DouBan ========== */
  DouBan: {
    supports: ['article'],
    article: {
      title: { required: true, min: 9, max: 100 },
      content: { required: true, max: 20000, note: 'HTML 格式' },
      tags: { note: '话题标签' },
      visibleType: VISIBLE_PUBLIC_PRIVATE,
      createType: [
        { value: 0, label: '不申明' },
        { value: 1, label: '申明原创' },
      ],
    },
  },

  /* ========== 简书 JianShu ========== */
  JianShu: {
    supports: ['article'],
    article: {
      title: { required: true, max: 100 },
      content: { required: true, max: 20000, note: 'HTML 格式' },
    },
  },

  /* ========== CSDN ========== */
  CSDN: {
    supports: ['article'],
    article: {
      title: { required: true, min: 9, max: 30 },
      desc: { required: true, min: 9, max: 100 },
      content: { required: true, max: 20000, note: 'HTML 格式；需 <div> 包裹' },
      covers: { required: true, min: 1 },
      tags: { required: true, max: 7 },
      statement: [
        { value: 0, label: '无声明' },
        { value: 1, label: 'AI 辅助' },
        { value: 2, label: '网络整合' },
        { value: 3, label: '个人观点' },
      ],
      visibleType: [
        { value: 0, label: '公开' },
        { value: 1, label: '自己可见' },
      ],
      createType: [
        { value: 1, label: '原创' },
        { value: 2, label: '转载' },
        { value: 4, label: '翻译' },
      ],
      prePubTime: { minHours: 2, maxDays: 14 },
    },
  },

  /* ========== Wifi 万能钥匙 WiFiWanNengYaoShi ========== */
  WiFiWanNengYaoShi: {
    supports: ['article'],
    article: {
      title: { required: true, min: 9, max: 100 },
      content: { required: true, max: 20000, note: 'HTML 格式；需 URL 链接支持' },
      covers: { required: true, note: '支持 1/3 封面' },
    },
  },
}

/* ──────────────── helpers ──────────────── */

/**
 * 海外平台（Composio）发布约束。**单独定义、不并入 TLF_PLATFORM_CONSTRAINTS**——
 * 后者与灵径后端 tlf_publish_spec 有一致性单测（test_publish_spec），海外平台不走灵径。
 * 字段限制按各平台 Composio action 必填 + 平台常识**预估**，可后续按实测调整。
 * 与 tlf_backend `services/composio_spec.py` 的 action 字段对应（LinkedIn commentary /
 * Facebook message / Reddit title+text / Instagram caption+图 / YouTube title+video）。
 */
export const OVERSEA_PLATFORM_CONSTRAINTS: Record<string, PlatformConstraint> = {
  LinkedIn: {
    supports: ['dynamic'],
    dynamic: {
      desc: { required: true, max: 3000, note: '帖子正文（commentary）' },
      images: { max: 20, note: '可选，最多 20 张图片（单图/多图自动适配）' },
    },
  },
  Facebook: {
    supports: ['dynamic', 'video'],
    dynamic: {
      desc: { required: true, max: 5000, note: '帖子正文（message）' },
      images: { max: 50, note: '可选，发到公共主页 Page；多张时按相册发布，文案可能不随图显示' },
    },
    video: {
      title: { max: 255, note: '视频标题（可选）' },
      desc: { max: 5000, note: '视频描述' },
      video: { required: true, note: '视频文件 URL（发到公共主页 Page）' },
    },
  },
  Reddit: {
    // Reddit（Composio）只支持文字 self 帖、不能发图，故只放行「文章」(Markdown 正文)，
    // 不支持「图文」(dynamic)。我们「文章」内容本就是 Markdown 源（发国内才转 HTML）。
    supports: ['article'],
    article: {
      title: { required: true, max: 300, note: '帖子标题（≤ 300 字）' },
      desc: { max: 40000, note: 'Markdown 正文：链接正常渲染；图片会退化为链接（Reddit self 帖限制）' },
    },
  },
  Instagram: {
    supports: ['dynamic', 'video'],
    dynamic: {
      desc: { max: 2200, note: '文案（caption）' },
      images: { required: true, min: 1, max: 10, note: 'Instagram 1 张为单图，2–10 张为多图轮播（carousel）' },
    },
    video: {
      desc: { max: 2200, note: '文案（caption）' },
      video: { required: true, note: 'Instagram 视频走 Reels：建议 9:16 竖屏、5–90 秒' },
    },
  },
  YouTube: {
    supports: ['video'],
    video: {
      title: { required: true, max: 100 },
      desc: { max: 5000, note: '视频描述' },
      video: { required: true, note: '视频文件 URL（自动上传到 YouTube）' },
    },
  },
  Twitter: {
    // X 一条帖子最多 4 张图，图片与视频不可混用（故 video 类型下不出图片字段）。
    // 正文 280 为普通账号的加权字符上限：中日韩字符算 2、链接固定算 23，X Premium 更高。
    supports: ['dynamic', 'video'],
    dynamic: {
      desc: { required: true, max: 280, note: '加权字数：中日韩字符算 2 个、链接固定算 23 个；X Premium 上限更高' },
      images: { max: 4, note: '可选，最多 4 张图片' },
    },
    video: {
      desc: { max: 280, note: '加权字数：中日韩字符算 2 个、链接固定算 23 个' },
      video: { required: true, note: '视频文件 URL（网关自动上传到 X）' },
    },
  },
}

/**
 * X/Twitter 加权字数：Unicode 0–4351 / 8192–8205 / 8208–8223 / 8242–8247 区间算 1（拉丁、数字、常见标点），
 * 其它（中日韩、emoji）算 2；任意 URL 固定算 23（t.co 缩短后长度）。与后端 tlf_content_payload.x_weighted_len 同规则。
 */
const X_URL_RE = /(?:https?:\/\/|www\.)\S+/gi
function xCharWeight(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  if (cp <= 4351 || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247)) return 1
  return 2
}
export function xWeightedLength(text: string): number {
  let total = 0
  let pos = 0
  for (const m of text.matchAll(X_URL_RE)) {
    for (const ch of text.slice(pos, m.index)) total += xCharWeight(ch)
    total += 23
    pos = (m.index ?? 0) + m[0].length
  }
  for (const ch of text.slice(pos)) total += xCharWeight(ch)
  return total
}

/** 正文长度：X 按加权字数，其它平台按字符数。 */
function textLengthFor(platformCode: string, text: string): number {
  return platformCode === 'Twitter' ? xWeightedLength(text) : text.length
}

/** 统一取平台约束：国内灵径表优先，否则海外表。 */
function _constraintOf(platformCode: string): PlatformConstraint | undefined {
  return TLF_PLATFORM_CONSTRAINTS[platformCode] ?? OVERSEA_PLATFORM_CONSTRAINTS[platformCode]
}

export function getKindConstraint(
  platformCode: string,
  kind: PublishKind,
): PublishKindSpec | undefined {
  const c = _constraintOf(platformCode)
  if (!c) return undefined
  return c[kind]
}

export function platformSupports(platformCode: string, kind: PublishKind): boolean {
  const c = _constraintOf(platformCode)
  if (!c || !c.supports) return true
  return c.supports.includes(kind)
}

/**
 * 该平台「文章」发布的正文是否走 HTML（spec.article.content.note 标了 'HTML'，
 * 如知乎 / 微博文章 / 百家号等）。用于决定自定义文章是否提供富文本编辑器，
 * 以及提交时是否把 Markdown 转成 HTML 下发 html_content。
 */
export function articleSupportsHtml(platformCode: string): boolean {
  const note = _constraintOf(platformCode)?.article?.content?.note
  return !!note && note.includes('HTML')
}

export function kindLabel(kind: PublishKind): string {
  switch (kind) {
    case 'video':
      return '视频'
    case 'article':
      return '文章'
    case 'dynamic':
      return '图文'
  }
}

export function inferPublishKind(
  contentType: string | undefined,
  layout?: string | null,
): PublishKind {
  // 形态优先：图文混编→文章；图文分离→图文（与生成侧严格对应，不混用）
  if (layout === 'mixed') return 'article'
  if (layout === 'dynamic') return 'dynamic'
  if (contentType === 'video') return 'video'
  if (contentType === 'article') return 'article'
  return 'dynamic'
}

/**
 * 根据来源内容类型 / 形态，限定用户可选的发布类型：
 * - 视频内容 → 仅「视频」
 * - 图片内容 → 仅「图文」（dynamic）
 * - 图文混编文章（layout=mixed）→ **仅「文章」**（正文内嵌图，只能发 article 类平台）
 * - 图文分离图片（layout=dynamic）→ **仅「图文」**（多图+文案，只能发 dynamic 类平台）
 * - 普通文章（无 layout）→ 「文章」或「图文」（图文模式下图片由用户自行上传）
 * 返回值首项为推荐 / 默认类型。
 */
export function allowedKindsForContentType(
  contentType: string | undefined,
  layout?: string | null,
): PublishKind[] {
  // 图文混编 / 图文分离严格单一类型，避免「混编当动态发」「动态当文章发」
  if (layout === 'mixed') return ['article']
  if (layout === 'dynamic') return ['dynamic']
  if (contentType === 'video') return ['video']
  if (contentType === 'article') return ['article', 'dynamic']
  return ['dynamic']
}

/* ──────────────── 校验 ──────────────── */

export interface PublishValidation {
  field: 'title' | 'desc' | 'content' | 'images' | 'video' | 'tags' | 'type' | 'visible_type' | 'statement' | 'pre_pub_time'
  level: 'error' | 'warning'
  message: string
}

export interface ValidateInput {
  platformCode: string
  kind: PublishKind
  title?: string
  desc?: string
  content?: string
  images?: string[]
  covers?: string[]
  videoUrl?: string
  videoDurationSeconds?: number  // 从 <video>.duration 探测
  tags?: string[]
  visibleType?: number | string | null
  statement?: number | string | null
  prePubTimeMs?: number | null
}

/**
 * 校验发布表单。返回所有违规项（error 阻塞提交，warning 仅提示）。
 */
export function validatePublishData(args: ValidateInput): PublishValidation[] {
  const {
    platformCode,
    kind,
    title = '',
    desc = '',
    content = '',
    images = [],
    covers = [],
    videoUrl = '',
    videoDurationSeconds,
    tags = [],
    visibleType,
    statement,
    prePubTimeMs,
  } = args
  const issues: PublishValidation[] = []

  if (!platformSupports(platformCode, kind)) {
    issues.push({
      field: 'type',
      level: 'error',
      message: `当前平台不支持 ${kindLabel(kind)} 发布`,
    })
    return issues
  }

  const c = getKindConstraint(platformCode, kind)
  if (!c) return issues

  // title
  if (c.title) {
    if (c.title.required && !title.trim()) {
      issues.push({ field: 'title', level: 'error', message: '标题必填' })
    }
    if (c.title.min !== undefined && title.length > 0 && title.length < c.title.min) {
      issues.push({ field: 'title', level: 'error', message: `标题至少 ${c.title.min} 字` })
    }
    if (c.title.max !== undefined && title.length > c.title.max) {
      issues.push({ field: 'title', level: 'error', message: `标题最多 ${c.title.max} 字` })
    }
  }

  // desc / content
  // body 字段语义：文章用 content（HTML 正文），动态/视频用 desc（简介）。
  // 取 spec 必须与 textValue 同源用 content 优先——否则同时声明 desc+content 的
  // 文章平台（微信公众号 content 无上限 / 抖音文章 content 8000）会误用 desc 的小上限。
  const textSpec = c.content ?? c.desc
  const textValue = c.content ? content : desc
  if (textSpec) {
    if (textSpec.required && !textValue.trim()) {
      issues.push({ field: c.content ? 'content' : 'desc', level: 'error', message: '正文必填' })
    }
    const textLen = textLengthFor(platformCode, textValue)
    const weightedHint = platformCode === 'Twitter' ? '（X 加权字数：中日韩算 2、链接算 23）' : ''
    if (textSpec.min !== undefined && textLen > 0 && textLen < textSpec.min) {
      issues.push({
        field: c.content ? 'content' : 'desc',
        level: 'error',
        message: `正文至少 ${textSpec.min} 字${weightedHint}`,
      })
    }
    if (textSpec.max !== undefined && textLen > textSpec.max) {
      issues.push({
        field: c.content ? 'content' : 'desc',
        level: 'error',
        message: `正文最多 ${textSpec.max} 字${weightedHint}，当前 ${textLen}`,
      })
    }
  }

  // images / covers
  const imgSpec = c.images ?? c.covers
  if (imgSpec) {
    const items = c.images ? images : covers
    const n = items.length
    if (imgSpec.required && n === 0) {
      issues.push({ field: 'images', level: 'error', message: imgSpec.note || '至少需要一张图片' })
    }
    if (imgSpec.min !== undefined && n > 0 && n < imgSpec.min) {
      issues.push({ field: 'images', level: 'error', message: `图片至少 ${imgSpec.min} 张` })
    }
    if (imgSpec.max !== undefined && n > imgSpec.max) {
      issues.push({
        field: 'images', level: 'error',
        message: imgSpec.max === 0 ? (imgSpec.note || '该平台不支持图片') : `图片最多 ${imgSpec.max} 张`,
      })
    }
  }

  // video
  if (c.video) {
    if (c.video.required && !videoUrl.trim()) {
      issues.push({ field: 'video', level: 'error', message: '视频必填' })
    }
    if (
      c.video.maxDurationSeconds !== undefined &&
      videoDurationSeconds !== undefined &&
      videoDurationSeconds > c.video.maxDurationSeconds
    ) {
      const limit =
        c.video.maxDurationSeconds >= 60
          ? `${Math.round(c.video.maxDurationSeconds / 60)} 分钟`
          : `${c.video.maxDurationSeconds} 秒`
      issues.push({ field: 'video', level: 'error', message: `视频时长不能超过 ${limit}` })
    }
  }

  // tags
  if (c.tags) {
    if (c.tags.required && tags.length === 0) {
      issues.push({ field: 'tags', level: 'error', message: '至少需要一个标签' })
    }
    if (c.tags.min !== undefined && tags.length > 0 && tags.length < c.tags.min) {
      issues.push({ field: 'tags', level: 'error', message: `标签至少 ${c.tags.min} 个` })
    }
    if (c.tags.max !== undefined && tags.length > c.tags.max) {
      issues.push({ field: 'tags', level: 'error', message: `标签最多 ${c.tags.max} 个` })
    }
    if (c.tags.itemMaxLength !== undefined) {
      for (const t of tags) {
        if (t.length > c.tags.itemMaxLength) {
          issues.push({
            field: 'tags',
            level: 'error',
            message: `「${t}」超过单标签 ${c.tags.itemMaxLength} 字上限`,
          })
          break
        }
      }
    }
  }

  // visibleType / statement enum 校验
  if (c.visibleType && visibleType != null) {
    const valid = c.visibleType.some((o) => o.value === visibleType)
    if (!valid) {
      issues.push({ field: 'visible_type', level: 'error', message: '可见性取值无效' })
    }
  }
  if (c.statement && statement != null && statement !== '') {
    const valid = c.statement.some((o) => o.value === statement)
    if (!valid) {
      issues.push({ field: 'statement', level: 'error', message: '创作申明取值无效' })
    }
  }

  // prePubTime 范围
  if (c.prePubTime && prePubTimeMs != null) {
    const now = Date.now()
    const minMs = now + c.prePubTime.minHours * 3600 * 1000
    const maxMs = now + c.prePubTime.maxDays * 24 * 3600 * 1000
    if (prePubTimeMs < minMs) {
      issues.push({
        field: 'pre_pub_time',
        level: 'error',
        message: `定时发布时间最少需在 ${c.prePubTime.minHours} 小时后`,
      })
    }
    if (prePubTimeMs > maxMs) {
      issues.push({
        field: 'pre_pub_time',
        level: 'error',
        message: `定时发布时间最多可设置 ${c.prePubTime.maxDays} 天内`,
      })
    }
  }

  return issues
}

/* ──────────────── 多平台「批量设置」支持矩阵 ────────────────
   解耦 step3 4 个批量控件的支持情况与具体 publish payload。来源：
   灵径官方批量设置 UI 的「不支持/支持」名单。

   字段语义：
   - `schedule: boolean` —— 「定时发布」是否支持（缺省 true，仅在不支持的平台显式 false）
   - `privateVisible: boolean` —— 「谁可以看：私密/草稿」是否支持（缺省 true，私密发送 visible_type=1）
   - `originalExtras: Partial<Record<PublishKind, Record<string, number>>>` ——
     用户勾选「开启原创声明」时该平台该 kind 实际下发的字段。空对象 `{}` 表示
     UI 里把它纳入"支持"但不额外下发字段
   - `aiExtras: Partial<Record<PublishKind, Record<string, number>>>` ——
     用户勾选「包含 AI 生成内容」时该平台该 kind 实际下发的字段。同上规则
*/
export interface PlatformBatchFlags {
  schedule?: boolean
  privateVisible?: boolean
  originalExtras?: Partial<Record<PublishKind, Record<string, number>>>
  aiExtras?: Partial<Record<PublishKind, Record<string, number>>>
}

export const PLATFORM_BATCH_FLAGS: Record<string, PlatformBatchFlags> = {
  // ── 不支持定时发布 ──
  PiPiXia: { schedule: false, privateVisible: false },
  SouHuShiPin: { schedule: false, aiExtras: { video: {} } },
  // "搜狐号"在批量设置名单中不支持定时；spec 里的 prePubTime 仅作为 single-mode 上限参考，
  // 批量模式下不下发 pre_pub_time
  SouHuHao: {
    schedule: false,
    aiExtras: { article: { statement: 3 } },
  },
  DeWu: { schedule: false, aiExtras: { video: {} } },

  // ── 不支持私密 ──
  DuoDuoShiPin: { privateVisible: false, aiExtras: { video: {} } },
  MeiPai: { privateVisible: false },
  ACFun: {
    privateVisible: false,
    originalExtras: { article: { create_type: 1 } },
  },
  YiCheHao: {
    privateVisible: false,
    aiExtras: { article: { statement: 3 } },
  },
  MeiYou: { privateVisible: false },

  // ── 支持「原创声明」(11 平台) ──
  ShiPinHao: { originalExtras: { video: {}, dynamic: {} } },
  XiaoHongShu: {
    originalExtras: { video: { statement: 3 }, dynamic: { statement: 3 } }, // 自主标注
    aiExtras: { video: { statement: 2 }, dynamic: { statement: 2 } }, // 含 AI 元素
  },
  BiLiBiLi: {
    originalExtras: { video: { create_type: 1 }, article: { create_type: 1 } },
    aiExtras: { video: { statement: 1 }, article: {} },
  },
  XinLangWeiBo: {
    originalExtras: { video: {}, article: {}, dynamic: {} },
    aiExtras: { dynamic: { statement: 1 } },
  },
  ZhiHu: {
    originalExtras: { article: {}, dynamic: {} },
    aiExtras: { article: { statement: 5 }, dynamic: {} }, // 5:AI 辅助
  },
  DaYuHao: {
    originalExtras: { video: {}, article: {} },
    aiExtras: { article: { statement: 4 } },
  },
  WangYiHao: {
    originalExtras: { article: { create_type: 1 }, video: {} },
    aiExtras: { video: { statement: 1 }, article: { statement: 1 } },
  },
  AiQiYi: {
    originalExtras: { video: {}, article: {} },
    aiExtras: { video: {}, article: {} },
  },
  CheJiaHao: {
    originalExtras: { article: { create_type: 1 }, video: {} },
  },

  // ── 仅支持「AI 生成内容」(不支持原创声明) ──
  DouYin: {
    aiExtras: {
      video: { statement: 3 },
      article: {},
      dynamic: { statement: 3 },
    },
  },
  KuaiShou: {
    aiExtras: { video: { statement: 1 }, dynamic: { statement: 1 } },
  },
  BaiJiaHao: {
    aiExtras: { video: { statement: 1 }, article: { statement: 1 }, dynamic: {} },
  },
  TouTiaoHao: {
    aiExtras: { video: { statement: 3 }, article: { statement: 3 }, dynamic: {} },
  },
  YiDianHao: {
    aiExtras: { article: { statement: 4 }, video: {} },
  },
  TengXunShiPin: { aiExtras: { video: {} } },
} as const

/**
 * 根据内容类型推断该平台应使用的 publish kind（多平台时每平台 kind 可能不同）。
 * 取该平台支持的允许 kind 中的第一个。
 */
export function getKindForPlatform(
  platformCode: string,
  allowedKinds: PublishKind[],
): PublishKind | undefined {
  return allowedKinds.find((k) => platformSupports(platformCode, k))
}

/** 取两数最小值（任一为 undefined 时退化到另一个） */
function minDef(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return Math.min(a, b)
}
function maxDef(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return Math.max(a, b)
}
function mergeRange(a: FieldRange | undefined, b: FieldRange | undefined): FieldRange | undefined {
  if (!a) return b
  if (!b) return a
  return {
    required: a.required || b.required,
    min: maxDef(a.min, b.min), // 最严格 min
    max: minDef(a.max, b.max), // 最严格 max
    note: a.note ?? b.note,
  }
}
function mergeMedia(a: MediaSpec | undefined, b: MediaSpec | undefined): MediaSpec | undefined {
  if (!a) return b
  if (!b) return a
  return {
    ...(mergeRange(a, b) as MediaSpec),
    maxFileSizeMB: minDef(a.maxFileSizeMB, b.maxFileSizeMB),
    minWidth: maxDef(a.minWidth, b.minWidth),
    minHeight: maxDef(a.minHeight, b.minHeight),
    maxDurationSeconds: minDef(a.maxDurationSeconds, b.maxDurationSeconds),
  }
}
function mergeTags(a: TagsSpec | undefined, b: TagsSpec | undefined): TagsSpec | undefined {
  if (!a) return b
  if (!b) return a
  return {
    ...(mergeRange(a, b) as TagsSpec),
    itemMaxLength: minDef(a.itemMaxLength, b.itemMaxLength),
  }
}

/**
 * 把多平台多 kind 的 spec 合并为「最严格聚合 spec」：
 * - 字符 / 张数 / 时长上限取 min；下限取 max；required = OR
 * - 不在所有选中平台 spec 中出现的字段不会被聚合
 *
 * 注意：标签 tags 在不支持的平台会被忽略，聚合时只考虑支持 tags 的子集（否则 tags.max 会被 undefined 拉空）。
 */
export function computeAggregateSpec(
  selections: Array<{ code: string; kind: PublishKind }>,
): PublishKindSpec {
  let agg: PublishKindSpec = {}
  const tagSpecs: TagsSpec[] = []
  for (const { code, kind } of selections) {
    const spec = getKindConstraint(code, kind)
    if (!spec) continue
    agg = {
      title: mergeRange(agg.title, spec.title),
      desc: mergeRange(agg.desc, spec.desc),
      content: mergeRange(agg.content, spec.content),
      images: mergeMedia(agg.images, spec.images),
      covers: mergeMedia(agg.covers, spec.covers),
      video: mergeMedia(agg.video, spec.video),
      hashtagMax: minDef(agg.hashtagMax, spec.hashtagMax),
      // tags 单独处理：仅在所有 spec 都声明 tags 时聚合，否则不出现
    }
    if (spec.tags) tagSpecs.push(spec.tags)
  }
  // tags 仅在所有平台 spec 都有时聚合（否则 tags 会被某不支持的平台拉为 undefined）
  if (tagSpecs.length > 0 && tagSpecs.length === selections.length) {
    agg.tags = tagSpecs.reduce((a, b) => mergeTags(a, b)!)
  }
  return agg
}

/**
 * 计算用于「标签输入框 UI」的并集 tags 规范：**只要任一选中平台需要/支持标签就返回**
 * （与 computeAggregateSpec 的「全部平台都有才聚合」不同）。
 *
 * 场景：多平台同发视频时，小红书/快手不需要标签、但哔哩哔哩需要（必填）。聚合 spec 会因
 * 「并非所有平台都有 tags」而丢弃 tags → 输入框不显示，但 B 站校验仍报「标签必填」，用户无从填写。
 * 这里对支持 tags 的子集做最严格合并（max 取 min、min 取 max、itemMaxLength 取 min、required = OR），
 * 标签提交时本就按平台过滤（不支持的平台会被丢弃），故展示给用户填写不会影响其它平台。
 */
export function computeUnionTagsSpec(
  selections: Array<{ code: string; kind: PublishKind }>,
): TagsSpec | undefined {
  let merged: TagsSpec | undefined
  for (const { code, kind } of selections) {
    const t = getKindConstraint(code, kind)?.tags
    if (t) merged = mergeTags(merged, t)
  }
  return merged
}

/**
 * 「标签」输入框的值在上游对应哪个字段名。
 * 多数平台是 `tags`，但少数平台的「话题」走独立的 `topics` 字段（知乎文章 / 抖音文章 / 易车号文章）——
 * 这些平台必须用 topics 下发，否则上游收不到（会被网关按平台 spec 丢弃）。
 * 与 tlf_backend/tlf_app/services/publish_spec.py 的 KindFields(topics/tags) 保持一致。
 */
const TOPICS_FIELD_KINDS = new Set<string>([
  'ZhiHu:article',
  'DouYin:article',
  'YiCheHao:article',
])
export function tagsFieldName(code: string, kind: PublishKind): 'tags' | 'topics' {
  return TOPICS_FIELD_KINDS.has(`${code}:${kind}`) ? 'topics' : 'tags'
}

/**
 * 该「平台·类型」是否需要选「内容分类」（一级/二级），以及是否必填。
 * 与 tlf_backend publish_spec.py 的 KindFields(category) / 文档 required 对齐。
 * 'required' = 上游必填（不选无法发布）；'optional' = 支持但可不选；'none' = 不涉及分类。
 */
const CATEGORY_REQUIRED = new Set<string>([
  'BiLiBiLi:video', 'BaiJiaHao:article', 'WangYiHao:video', 'YiDianHao:video',
  'SouHuHao:video', 'SouHuHaoVideo:video', 'QiEHao:video', 'AiQiYi:video',
  'FengWang:video', 'ACFun:article',
])
const CATEGORY_OPTIONAL = new Set<string>([
  'XinLangWeiBo:video', 'BiLiBiLi:article', 'MeiPai:video',
  'DaYuHao:video', 'DaYuHaoVideo:video', 'WiFiWanNengYaoShi:article',
])
export function categoryRequirement(code: string, kind: PublishKind): 'required' | 'optional' | 'none' {
  const key = `${code}:${kind}`
  if (CATEGORY_REQUIRED.has(key)) return 'required'
  if (CATEGORY_OPTIONAL.has(key)) return 'optional'
  return 'none'
}

/**
 * 根据用户在「批量设置」里的勾选，为某个平台某种 kind 生成实际下发的 extras 字段。
 * 调用方在循环每平台调 publish API 时使用。
 *
 * 优先级：若 originalChecked && aiChecked 都勾选，且该平台两套 extras 都有 payload，
 * **优先 AI**（更高优先级的合规披露）；否则按各自 extras 合并。
 *
 * 返回 dict 可直接 spread 到 TlfPublishRequest（visible_type / statement / pre_pub_time / create_type 等）。
 */
export function computePerPlatformBatchExtras(args: {
  platformCode: string
  kind: PublishKind
  originalChecked: boolean
  aiChecked: boolean
  isPublic: boolean
  scheduleEnabled: boolean
  prePubTimeMs: number | null | undefined
}): Record<string, number> {
  const { platformCode, kind, originalChecked, aiChecked, isPublic, scheduleEnabled, prePubTimeMs } = args
  const flags = PLATFORM_BATCH_FLAGS[platformCode] ?? {}
  const out: Record<string, number> = {}

  // 「谁可以看」—— 公开默认 0；私密仅在支持私密的平台下发 1
  if (isPublic) {
    out.visible_type = 0
  } else if (flags.privateVisible !== false) {
    out.visible_type = 1
  } else {
    out.visible_type = 0 // 不支持私密的平台回退公开
  }

  // 「定时发布」
  const spec = getKindConstraint(platformCode, kind)
  if (
    scheduleEnabled &&
    prePubTimeMs != null &&
    flags.schedule !== false &&
    spec?.prePubTime
  ) {
    out.pre_pub_time = prePubTimeMs
  }

  // 「原创」+「AI」—— AI 优先
  if (aiChecked) {
    const ext = flags.aiExtras?.[kind]
    if (ext) Object.assign(out, ext)
  }
  if (originalChecked && !aiChecked) {
    // 仅原创勾选时下发原创 extras（避免和 AI 冲突）
    const ext = flags.originalExtras?.[kind]
    if (ext) Object.assign(out, ext)
  } else if (originalChecked && aiChecked) {
    // 两者都勾选：AI 占用 statement 字段；如果 originalExtras 用的是 create_type 等不冲突字段，仍合并
    const ext = flags.originalExtras?.[kind]
    if (ext) {
      for (const [k, v] of Object.entries(ext)) {
        if (out[k] === undefined) out[k] = v
      }
    }
  }

  return out
}

/** 该平台是否在用户选中「批量设置」时被视为支持「原创声明」 */
export function batchOriginalSupported(platformCode: string, kind: PublishKind): boolean {
  return !!PLATFORM_BATCH_FLAGS[platformCode]?.originalExtras?.[kind]
}
/** 该平台是否被视为支持「AI 生成内容」 */
export function batchAISupported(platformCode: string, kind: PublishKind): boolean {
  return !!PLATFORM_BATCH_FLAGS[platformCode]?.aiExtras?.[kind]
}
