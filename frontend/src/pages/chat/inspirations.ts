import type { LucideIcon } from 'lucide-react'
import { Flame, TrendingUp, Globe2, Target, Zap, BadgePercent, Lightbulb } from 'lucide-react'

export const industries = [
  { id: 'all', label: '全行业' },
  { id: 'beauty', label: '美妆个护' },
  { id: 'pet', label: '宠物' },
  { id: 'home', label: '家居' },
  { id: 'food', label: '食品' },
  { id: 'fashion', label: '服饰' },
  { id: '3c', label: '3C 数码' },
] as const

export type IndustryId = (typeof industries)[number]['id']

export const channels = [
  { id: 'all', label: '全渠道' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'xhs', label: '小红书' },
] as const

export type ChannelId = (typeof channels)[number]['id']

export type HotContent = {
  id: string
  title: string
  category: '产品展示' | '对比测评' | '开箱体验' | '教程演示' | '促销逼单'
  industry: IndustryId
  channel: ChannelId
  exposure: string
  engagement: string
  prompt: string
}

export const hotContents: HotContent[] = [
  {
    id: 'h1',
    title: '#开箱挑战：38 秒讲透产品三大卖点',
    category: '开箱体验',
    industry: 'beauty',
    channel: 'tiktok',
    exposure: '320 万',
    engagement: '7.8%',
    prompt: `你是一名 TikTok 美妆爆款编导，请按以下结构生成一条「38 秒开箱挑战」短视频完整脚本：

# 目标产品
（请补全）

# 输出格式（按时间轴分段）
| 时间 | 画面/动作 | 口播 / 字幕 | 音效/BGM |
| 0-3s | 黄金 3 秒 hook（反转 / 悬念 / 视觉冲击） | … | … |
| 4-12s | 第 1 卖点 — 包装/质感（强调感官） | … | … |
| 13-22s | 第 2 卖点 — 核心功效（实拍 / 上脸前后对比） | … | … |
| 23-32s | 第 3 卖点 — 性价比 / 场景适用 | … | … |
| 33-38s | 强 CTA + 引导互动（评论问句 / 主页链接） | … | … |

# 风格要求
- 口语化、有梗，单句不超过 12 字
- 全程节奏紧凑，避免冗余形容词
- 卖点直接 + 痛点解决型表达，不堆参数

# 同时输出
1. 视频标题（≤25 字，含 emoji 1 个）
2. 封面文字（≤8 字，主标 + 副标各 1 行）
3. 5 个相关 hashtag（含 1 个挑战 hashtag）`,
  },
  {
    id: 'h2',
    title: '前后对比：30 天养护实测',
    category: '对比测评',
    industry: 'pet',
    channel: 'youtube',
    exposure: '160 万',
    engagement: '6.1%',
    prompt: `你是一名 YouTube 宠物频道编导，请生成一条「30 天实测对比」视频完整脚本（时长 4-6 分钟）：

# 目标产品 / 测试场景
（请补全，例如：xx 品牌猫粮 30 天换粮实测，针对成猫毛色与肠胃）

# 脚本结构
## 1. 黄金 15 秒 hook
- 直接展示 Day 0 vs Day 30 的强烈视觉对比
- 主持人一句话引出冲突或好奇点

## 2. 自我介绍 + 测试规则（30s）
- 测试对象（年龄/品种/原本状态）
- 控制变量（饮食/环境/记录方式）
- 评估维度（≥3 项，含可量化指标）

## 3. 过程分段（按周）
- Day 1-7：初次反应 / 适口性
- Day 8-15：阶段变化
- Day 16-23：明显改善
- Day 24-30：最终结果

每段配：实拍片段建议 + 旁白要点 + 数据/称重/拍照节点

## 4. 数据总结表
列出可量化指标的对比表（产前 / 产后 / 变化幅度）

## 5. 结论与建议
- 适合什么样的宠物
- 不适合什么场景
- 长期成本估算

## 6. CTA
- 订阅 / 留言互动 / 下集预告

# 风格要求
真实、克制、给出客观数据；避免过度营销话术；适当展示意料之外的小细节增加可信度`,
  },
  {
    id: 'h3',
    title: '5 步快速完成的家居改造',
    category: '教程演示',
    industry: 'home',
    channel: 'instagram',
    exposure: '88 万',
    engagement: '5.4%',
    prompt: `你是一名 Instagram 家居改造博主，请生成一篇「5 步家居改造」轮播图文（适配 Reels + Carousel）：

# 改造主题
（请补全，例如：30 平出租屋客厅 200 元改造）

# 输出 7 张轮播图 + 配文
- Cover：吸睛主图，标题 ≤14 字（强对比："出租屋 → 杂志感"等）
- P2-P6：5 步骤，每张
  · 步骤名（≤6 字）
  · 操作要点 2-3 句
  · 所需物品 + 预算
  · 拍摄建议（角度 / 光线 / 道具）
- P7：Before vs After 大图 + 总预算 + 总耗时

# 主文案（≤2200 字，分 3-5 段）
- 段 1：痛点共鸣（出租房常见 3 痛点）
- 段 2：改造思路总览
- 段 3-4：分步骤展开
- 段 5：成果 + 给读者的可复用清单

# 必含
- 5-8 个 hashtag（混合大词 + 小词 + 品牌词）
- 1 个互动问句结尾
- 储物 / 灯光 / 软装 至少各覆盖 1 个步骤

# 风格要求
真诚、有生活气息、可执行；避免炫技；预算与可获得性优先`,
  },
  {
    id: 'h4',
    title: '限时折扣 + 紧迫感叠加文案',
    category: '促销逼单',
    industry: 'fashion',
    channel: 'facebook',
    exposure: '210 万',
    engagement: '4.7%',
    prompt: `你是一名擅长高转化电商投放的 Facebook 广告文案，请生成一套「限时折扣 + 紧迫感」促销文案组合：

# 产品与活动
（请补全：产品名 / 原价 / 折后价 / 活动截止时间 / 库存提示）

# 输出 5 版投放文案
每版：
1. Primary text（≤125 字符，前 3 行黄金区必须含数字 / 折扣 / 时间）
2. Headline（≤40 字符，强动词开头）
3. Description（≤30 字符）
4. CTA 按钮文字（从 立即抢购 / 限时领取 / 锁定优惠 / 查看库存 / 仅剩 X 件 中选）

# 5 版差异化
- 版本 A：稀缺性主导（库存仅剩 N 件）
- 版本 B：紧迫感主导（倒计时 / 今晚 24:00 截止）
- 版本 C：社交证明主导（已有 N 人下单 / 4.9 星）
- 版本 D：价格锚定主导（原价 → 现价 → 你省了多少）
- 版本 E：情绪 + 损失厌恶（错过再等一年）

# 通用规则
- 每版必含 1 个具体数字（金额 / 件数 / 时间 / 百分比）
- 不使用"史上最低"等违规话术
- 末尾配 1 个 emoji，不超过 3 个

# 附赠
- 3 个落地页头图主标语（≤10 字）
- 1 段适用于评论区的"催单话术"（≤80 字）`,
  },
  {
    id: 'h5',
    title: '产品故事化讲解：从问题到解决方案',
    category: '产品展示',
    industry: 'food',
    channel: 'xhs',
    exposure: '95 万',
    engagement: '8.3%',
    prompt: `你是一名小红书爆款种草博主（食品/饮品赛道），请按「问题 → 转折 → 产品 → 结果」四段结构生成一篇笔记：

# 目标产品
（请补全：产品名 / 卖点 / 适用人群 / 口味或风味描述）

# 笔记结构
## 标题（≤20 字）
含 1 个数字 + 1 个 emoji + 痛点关键词，避免营销词

## 封面文案（≤8 字）
主标 + 副标各一行，主标用反差感词汇

## 正文（≤600 字，分 4 段）
1. 问题（80-120 字）— 第一人称生活场景痛点，让读者点头
2. 转折（60-100 字）— 偶遇 / 朋友推荐 / 偶然发现的契机
3. 产品体验（200-300 字）— 三段感官细节：第一口 / 第二次复购 / 长期感受；穿插 2 个具体数字（克重 / 价格 / 持续时间）
4. 结果 + 收尾（80-120 字）— 现在的生活变化 + 适合什么样的姐妹

## 必含
- 3 个产品图描述（具体到角度、光线、道具）
- 8 个 hashtag（混合 #品类大词 #场景小词 #人群标签 #风味描述）
- 1 个互动问句 + 1 个温和 CTA（链接在主页 / 评论扣 1）

# 风格要求
真实姐妹分享口吻、克制不浮夸；避免"绝绝子""yyds"等过度词；融入 1-2 个轻微"小遗憾"提升可信度`,
  },
]

export type GrowthStrategy = {
  id: string
  title: string
  category: '黄金3秒' | '卖点角度' | '爆款公式' | '高转化CTA'
  desc: string
  effect: string
  industry: IndustryId
  icon: LucideIcon
  prompt: string
}

export const growthStrategies: GrowthStrategy[] = [
  {
    id: 'g1',
    title: '反向钩子开场',
    category: '黄金3秒',
    desc: '用"千万别买"等反向语言制造好奇，逼迫用户看下去',
    effect: '平均 +2.4× 完播率',
    industry: 'all',
    icon: Zap,
    prompt: `你是一名擅长短视频前 3 秒钩子设计的资深编导。请用「反向钩子」公式为以下产品生成 8 条开场文案：

# 目标产品 / 主题
（请补全）

# 反向钩子公式（必须覆盖以下 4 类各 2 条）
1. 否定式反转（"千万别 / 别再 / 不要再 / 拒绝"开头 + 给出真相）
2. 反常识陈述（"原来 / 其实 / 没想到 / 居然"开头 + 颠覆认知）
3. 自我吐槽（"我承认 / 我错了 / 真后悔"开头 + 真实坑点）
4. 危险警告（"99% 的人都不知道 / 早知道就 / 再不…就晚了"）

# 每条输出格式
| 钩子文案（≤15 字） | 配套画面建议 | 第 4 秒承接 1 句 | 适用场景 |
|---|---|---|---|

# 要求
- 每条钩子必须能让观众产生「想看下去」的悬念
- 不出现具体数字大于 99 的吹牛
- 避免"震惊体"老梗（震惊 / 万万没想到）
- 末尾给出 1 段「钩子选择建议」：什么人群更适合哪一类公式`,
  },
  {
    id: 'g2',
    title: '差异化卖点矩阵',
    category: '卖点角度',
    desc: '从功能、场景、人群、情绪 4 维度拆解卖点，避免同质化',
    effect: '内容采用率 +60%',
    industry: 'all',
    icon: Target,
    prompt: `你是一名产品营销策略师，请用「功能 × 场景 × 人群 × 情绪」四维矩阵为以下产品拆解差异化卖点：

# 目标产品
（请补全：产品名 / 品类 / 核心功能 / 价格带）

# 输出 4 维度矩阵表
## 维度 1 — 功能卖点（≥3 个）
| 功能 | 用户能感知的具体效果 | 一句话广告语 | 配套证据 / 实验数据建议 |

## 维度 2 — 场景卖点（≥4 个，覆盖：日常 / 通勤 / 礼赠 / 极端场景）
| 场景 | 痛点 | 产品如何解决 | 一句话广告语 |

## 维度 3 — 人群卖点（≥4 个细分人群）
| 人群画像 | 核心诉求 | 沟通切入点 | 一句话广告语 |

## 维度 4 — 情绪卖点（≥3 个情绪关键词）
| 情绪 | 触发情境 | 产品承载的情绪价值 | 一句话广告语 |

# 最后输出
1. 「同质化雷区」：列出该品类常见的 3-5 个被用滥的卖点，建议避开
2. 「差异化突围建议」：从 4 维度中选出 1-2 个本品独占的优势组合
3. 「跨平台投放建议」：哪些维度更适合 TikTok / 小红书 / YouTube`,
  },
  {
    id: 'g3',
    title: 'AIDA 爆款公式',
    category: '爆款公式',
    desc: 'Attention → Interest → Desire → Action 四段式结构',
    effect: '转化率 +35%',
    industry: 'all',
    icon: Flame,
    prompt: `你是一名直效营销文案专家，请用 AIDA 公式（Attention → Interest → Desire → Action）为以下产品生成一篇爆款长图文 / 60 秒口播脚本：

# 产品 / 目标人群
（请补全：产品名 / 卖点 / 目标人群画像 / 投放渠道）

# 输出结构（每段标注作用 + 字数）
## A · Attention 注意（≤30 字）
- 强反差 / 反常识开头，让目标人群停下来
- 必含 1 个具体数字或对比
- 标注：这一句解决「为什么用户要看」

## I · Interest 兴趣（80-120 字）
- 戳痛点 → 提升问题严重性 → 引出"还有别的方案吗？"的好奇
- 必须用第二人称"你"
- 标注：这一段解决「为什么这个问题值得继续看」

## D · Desire 渴望（120-180 字）
- 引出产品 → 描述使用后画面（具体到感官、时间、场景）
- 至少 1 个用户场景化故事或数据证据
- 标注：这一段解决「为什么是这个产品」

## A · Action 行动（≤50 字）
- 给一个「小到几乎没成本」的下一步动作
- 含明确稀缺性 / 紧迫性 / 风险逆转（如 7 天无理由）
- 标注：这一句解决「为什么是现在」

# 附加输出
1. 同一篇内容的 3 个标题候选（≤20 字）
2. 该结构适合的平台与不适合的平台
3. 易踩坑点 3 条（如 A 段过长、D 段缺少证据等）`,
  },
  {
    id: 'g4',
    title: '高转化 CTA 库',
    category: '高转化CTA',
    desc: '稀缺性 / 紧迫感 / 社交证明 三类 CTA 组合',
    effect: '点击率 +50%',
    industry: 'all',
    icon: BadgePercent,
    prompt: `你是一名擅长 A/B 测试 CTA 优化的转化专家，请为以下产品生成 12 条高转化 CTA 文案：

# 产品 / 场景
（请补全：产品名 / 投放渠道 / 当前漏斗节点 / 目标动作）

# 输出 4 类 × 各 3 条
## 1. 稀缺性 CTA（强调数量 / 名额限制）
- 每条 ≤15 字
- 必含具体数字
- 配套：建议放置位置 + 适用人群

## 2. 紧迫感 CTA（强调时间 / 截止）
- 每条 ≤15 字
- 含明确时间锚点（24h / 今晚 / 仅 X 天）

## 3. 社交证明 CTA（强调"别人都在做"）
- 每条 ≤15 字
- 含具体数字（X 万人 / X 评价 / X 复购率）

## 4. 风险逆转 CTA（消除决策阻力）
- 每条 ≤15 字
- 含 0 风险承诺（7 天退 / 试用装 / 不满意全额）

# 每条统一输出格式
| 类型 | CTA 文案 | 适合渠道 | 适合漏斗节点 | A/B 测试建议 |

# 最后给出
1. 「CTA 组合建议」：哪 2 条搭配在一起转化最高
2. 「禁用词清单」：3-5 个法规风险或老梗词
3. 「按钮设计建议」：颜色 / 形状 / 位置 / 微动效`,
  },
]

export type IndustryInsight = {
  id: IndustryId
  emoji: string
  name: string
  recommendType: string
  recommendChannel: string
  recommendSkill: string
  prompt: string
}

function build7DayPlanPrompt(opts: {
  industry: string
  formats: string
  channels: string
  skills: string
  industryHints: string
}): string {
  return `你是一名全域社媒内容策划主理人，请为以下「${opts.industry}」品牌生成完整的 7 天内容包：

# 目标产品 / 品牌
（请补全：品牌名 / 产品 / 卖点 / 目标市场 / 目标人群）

# 7 天主题节奏（必须按此结构）
- Day 1 — 立人设 / 品牌故事
- Day 2 — 痛点共鸣 / 用户场景化
- Day 3 — 产品深度解构 + 核心卖点
- Day 4 — 真实测评 / 对比 / 体验
- Day 5 — 用户证言 / UGC 串联
- Day 6 — 干货教程 / 实用清单
- Day 7 — 促销 / 限时活动 / 用户复购

# 每天输出
| 字段 | 内容 |
| 主题 | （≤12 字） |
| 形式 | ${opts.formats}（每天可不同） |
| 平台 | ${opts.channels}（按平台调性匹配） |
| 黄金 3 秒 hook | 一句话 |
| 内容大纲 | 5-7 行分镜或段落，含画面/口播/字幕要点 |
| CTA | 一句话 |
| 标签 / hashtag | 3-5 个 |
| 配套素材建议 | 拍摄道具 / B-roll / 模板字体 |
| 预计产出耗时 | 小时 |

# 行业特别提示
${opts.industryHints}

# 最后输出
1. 「7 天主线」：用 1 句话概括整周的叙事弧
2. 「跨平台分发策略」：同一选题如何在 ${opts.channels} 之间二次裁剪
3. 「KPI 建议」：核心可追踪指标 + 合理目标范围
4. 「3 条 backup 选题」：当某天临时缺料时的替代方案

# 风格要求
- 真实可执行、避免空话
- 套用本品牌核心卖点作为主线，不堆砌行业术语
- 重点平台优先 ${opts.skills}`
}

export const industryInsights: IndustryInsight[] = [
  {
    id: 'beauty',
    emoji: '💄',
    name: '美妆个护',
    recommendType: '开箱测评 + 前后对比',
    recommendChannel: 'TikTok / 小红书',
    recommendSkill: '黄金 3 秒 + 故事化讲解',
    prompt: build7DayPlanPrompt({
      industry: '美妆个护',
      formats: '短视频 30-60s / 小红书图文 / 教程长视频',
      channels: 'TikTok / 小红书 / Instagram Reels',
      skills: '黄金 3 秒钩子 + 第一人称故事化 + 上脸前后对比',
      industryHints: `- 必含成分党 / 肤质适配维度的可信表达，避免夸大功效
- 安全词清单：禁用「最」「治疗」「祛痘根除」等违规词
- 至少 1 天围绕季节性场景（夏天油皮 / 冬天干敏）
- 一周中至少 2 天保留 UGC 风格（非精致摆拍）`,
    }),
  },
  {
    id: 'pet',
    emoji: '🐾',
    name: '宠物',
    recommendType: '萌宠日常 + 喂养教程',
    recommendChannel: 'YouTube / Instagram',
    recommendSkill: '情绪共鸣 + 实测对比',
    prompt: build7DayPlanPrompt({
      industry: '宠物',
      formats: '萌宠日常短视频 / 长测评 / Reels / Story 互动',
      channels: 'YouTube / Instagram / TikTok',
      skills: '情绪共鸣 hook + 30 天实测 + 真实喂养记录',
      industryHints: `- 至少 2 天主打"养宠痛点"（毛球 / 挑食 / 分离焦虑）
- 强调安全 / 适口性 / 长期成本，避免过度营销
- 至少 1 天利用宠物拟人化梗增加传播性
- 投喂场景需真实，避免 staged 感`,
    }),
  },
  {
    id: 'home',
    emoji: '🏠',
    name: '家居',
    recommendType: '改造教程 + 神器推荐',
    recommendChannel: '小红书 / Facebook',
    recommendSkill: '步骤拆解 + 前后对比',
    prompt: build7DayPlanPrompt({
      industry: '家居',
      formats: '改造图文轮播 / 神器清单视频 / Before-After Reels',
      channels: '小红书 / Instagram / Facebook',
      skills: '步骤拆解 + 预算透明 + 强 Before/After 视觉',
      industryHints: `- 至少 2 天围绕小户型 / 出租屋的现实约束
- 每天给出可量化预算 + 总耗时
- 必含至少 1 天「不动工改造」清单，降低门槛
- 风格统一：北欧 / 极简 / 复古中选 1 个作为本周视觉锚`,
    }),
  },
  {
    id: 'food',
    emoji: '🍱',
    name: '食品',
    recommendType: '制作过程 + 试吃反应',
    recommendChannel: 'TikTok / YouTube',
    recommendSkill: 'ASMR + 沉浸式体验',
    prompt: build7DayPlanPrompt({
      industry: '食品 / 饮品',
      formats: '制作过程短视频 / 试吃反应 / 食谱图文 / ASMR',
      channels: 'TikTok / YouTube Shorts / 小红书',
      skills: 'ASMR 收音 + 第一口反应 + 真实复购场景',
      industryHints: `- 至少 1 天用 ASMR 沉浸式拍摄（咀嚼 / 倒液 / 切割）
- 至少 1 天与日常餐桌或办公室场景结合
- 必含食用方式多样性（直接吃 / 搭配 / 改造食谱）
- 标注热量 / 配料 / 适用人群（控糖 / 高蛋白 / 素食）`,
    }),
  },
  {
    id: 'fashion',
    emoji: '👗',
    name: '服饰',
    recommendType: '穿搭 OOTD + 场景化',
    recommendChannel: 'Instagram / 小红书',
    recommendSkill: '风格分类 + 一衣多穿',
    prompt: build7DayPlanPrompt({
      industry: '服饰',
      formats: 'OOTD 短视频 / 穿搭图文 / 一衣多穿教程 / 转场 Reels',
      channels: 'Instagram / 小红书 / TikTok',
      skills: '风格分类 + 一衣多穿 + 通勤/约会/旅行多场景',
      industryHints: `- 每天围绕 1 个具体场景（通勤 / 约会 / 旅行 / 周末）
- 至少 1 天主打"一衣多穿"或"基础款搭出高级感"
- 必含尺码 / 身高 / 体重参考 + 不同身材建议
- 突出材质 / 工艺细节特写镜头`,
    }),
  },
  {
    id: '3c',
    emoji: '📱',
    name: '3C 数码',
    recommendType: '功能演示 + 横向评测',
    recommendChannel: 'YouTube / B 站',
    recommendSkill: '参数可视化 + 应用场景',
    prompt: build7DayPlanPrompt({
      industry: '3C 数码',
      formats: '横向评测长视频 / 功能演示 Short / 拆机图文 / 场景实测',
      channels: 'YouTube / B 站 / 小红书',
      skills: '参数可视化（图表 / benchmark）+ 真实应用场景',
      industryHints: `- 至少 1 天做横向对比（同价位 / 同品类）
- 必含真实使用场景（创作者 / 学生 / 商务）的痛点对照
- 参数可视化：用图表或前后对比展示，避免堆数字
- 至少 1 天主打「值不值」决策框架（预算 vs 性能）`,
    }),
  },
]

export const inspirationIcons = {
  hot: Flame as LucideIcon,
  growth: TrendingUp as LucideIcon,
  industry: Globe2 as LucideIcon,
  sparkle: Lightbulb as LucideIcon,
  light: Lightbulb as LucideIcon,
}
