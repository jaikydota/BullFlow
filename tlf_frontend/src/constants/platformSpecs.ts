/**
 * 推量发后台「平台能力」页用：各平台分发的内容字段约束（长度/图片/视频/枚举/定时/分类）。
 *
 * 展示用静态目录，与本仓库 frontend/src/utils/tlfPlatformConstraints.ts 同源（去掉校验/批量逻辑）。
 * 扩展字段的「支持/必填」以后端 GET /api/admin/v1/platforms 实时矩阵为准（publish_spec.py）；
 * 本文件提供长度/枚举/视频等参考约束。两者按 platform_code + kind 在页面合并展示。
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
  /** 占位（本期 UI 不实现，仅供后端透传） */
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
