import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  FileText,
  ImageIcon,
  Loader2,
  Pencil,
  FolderOpen,
  Send,
  Trash2,
  Upload,
  Video as VideoIcon,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/common/Toast'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { ArticlePreviewModal } from '@/components/common/ArticlePreviewModal'
import { MediaPreview } from '@/components/common/MediaPreview'
import { PlatformBadge } from '@/components/tlf/PlatformBadge'
import { PlatformLogo } from '@/components/tlf/PlatformLogo'
import { MediaPicker, type PickedMedia } from '@/components/tlf/MediaPicker'
import { imagesApi } from '@/api/images'
import { videosApi } from '@/api/videos'
import { tlfApi } from '@/api/tlf'
import { generationApi } from '@/api/generation'
import { getPlatformName } from '@/utils/tlfPlatforms'
import {
  getKindConstraint,
  inferPublishKind,
  allowedKindsForContentType,
  articleSupportsHtml,
  kindLabel,
  platformSupports,
  validatePublishData,
  tagsFieldName,
  computePerPlatformBatchExtras,
  type PublishKind,
} from '@/utils/tlfPlatformConstraints'
import { markdownToHtml } from '@/utils/markdownToHtml'
import { useDistributionConfig } from '@/components/tlf/useDistributionConfig'
import { PlatformPicker, DistributionSettings, AccountPicker } from '@/components/tlf/DistributionConfig'
// 富文本编辑器（Tiptap，体积较大）按需懒加载：仅在选了支持 HTML 的文章平台时拉取
const ArticleBodyEditor = lazy(() =>
  import('@/components/tlf/ArticleBodyEditor').then((m) => ({ default: m.ArticleBodyEditor })),
)
import type { TlfCategoryNode, TlfPrefillWarning } from '@/types/tlf'
import type { GeneratedContent } from '@/types/generation'
import { ApiError } from '@/types/api'
import { cn } from '@/lib/utils'

const TYPE_ICON: Record<string, typeof FileText> = {
  article: FileText,
  image: ImageIcon,
  video: Clapperboard,
}

const TYPE_TONE: Record<string, string> = {
  article: 'text-blue-600 bg-blue-500/10',
  image: 'text-emerald-600 bg-emerald-500/10',
  video: 'text-rose-600 bg-rose-500/10',
}

const PAGE_SIZE = 12

type PickerTarget = 'video' | 'cover' | 'image' | null

export default function TlfPublishPage() {
  const navigate = useNavigate()
  const location = useLocation()

  // 任务监控「重试」跳转携带的预填：内容 + 平台 + 失败账号（只重发失败账号）
  const retryState = (location.state as {
    retry?: { contentId: string | null; platform: string; accountIds: string[]; kind?: string }
  } | null)?.retry
  const retryAppliedRef = useRef(false)

  // ── 步骤 ──
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // ── Step 1：内容 ──
  const [contents, setContents] = useState<GeneratedContent[]>([])
  const [contentsLoading, setContentsLoading] = useState(false)
  const [selectedContent, setSelectedContent] = useState<GeneratedContent | null>(null)
  const [previewItem, setPreviewItem] = useState<GeneratedContent | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | 'article' | 'image' | 'video'>('all')
  // Step1 模式：'library'=从已生成内容选；'custom'=自定义内容（直选发布类型，手填）
  const [step1Mode, setStep1Mode] = useState<'library' | 'custom'>('library')
  // 自定义模式下用户直选的发布类型（video/dynamic/article）；library 模式为 null
  const [customKind, setCustomKind] = useState<PublishKind | null>(null)
  const [contentPage, setContentPage] = useState(1)
  const [contentTotal, setContentTotal] = useState(0)

  // ── Step 3：文案 + 媒体（内容侧；分发决策见下方 useDistributionConfig） ──
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [videoUrl, setVideoUrl] = useState<string>('')
  const [covers, setCovers] = useState<string[]>([])
  const [images, setImages] = useState<string[]>([])

  // ── Step 3：标签（公共字段；提交时仅对支持 tags 的平台带上） ──
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  const [videoDuration, setVideoDuration] = useState<number | undefined>(undefined)
  const [autoFillWarnings, setAutoFillWarnings] = useState<TlfPrefillWarning[]>([])
  const [submitting, setSubmitting] = useState(false)

  // ── MediaPicker 状态 ──
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null)

  // 防重复 auto-fill：相同 selectedContent.id 只填一次
  const lastAutoFilledRef = useRef<string | null>(null)

  // ── 加载内容 ──
  const loadContents = useCallback(async () => {
    setContentsLoading(true)
    try {
      const data = await generationApi.list({
        page: contentPage,
        page_size: PAGE_SIZE,
        type: typeFilter === 'all' ? undefined : typeFilter,
      })
      setContents(data.items || [])
      setContentTotal(data.total || 0)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '加载内容失败')
    } finally {
      setContentsLoading(false)
    }
  }, [contentPage, typeFilter])

  useEffect(() => {
    void loadContents()
  }, [loadContents])

  // ── Step 2 派生：内容类型推导的允许发布类型 + 兼容平台 ──
  // 派生发布类型：自定义模式用直选的 customKind；否则按所选内容类型推导
  const inferredKind = useMemo(
    () => customKind ?? inferPublishKind(selectedContent?.type, selectedContent?.layout),
    [customKind, selectedContent],
  )
  const allowedKinds = useMemo(
    () => (customKind ? [customKind] : allowedKindsForContentType(selectedContent?.type, selectedContent?.layout)),
    [customKind, selectedContent],
  )
  // 分发决策（平台/账号/分类/批量设置）统一由复用 hook 承载，与「自动生成规则」共用同一套逻辑。
  // 这里用同名解构，使下方校验/提交/JSX 引用保持不变。
  const dc = useDistributionConfig({ allowedKinds, inferredKind, mode: 'publish' })
  const {
    platformCodes, setPlatformCodes,
    selectedAccountIdsByPlatform, categorySelByPlatform,
    isPublic, originalChecked, aiChecked, scheduleEnabled, redditSubreddit,
    kindByPlatform, tagsSpec, isMultiPlatform, singlePlatformCode, singleKind, dominantKind,
    titleRange, descRange, imagesRange, prePubTimeMs,
    categoryError, allPlatformsHaveAccount, totalSelectedAccounts,
  } = dc

  // ── 选中内容 / 切平台后按后端统一映射(/tlf/prefill)预填 ──
  // 触发键 = content.id + 平台 code 列表（排序）。任一变化都重跑，但 step3 手改的字段
  // 不会因为相同 fillKey 重新填一遍。映射逻辑（取哪个字段/多图/封面/截断）与自动分发共用
  // 后端 build_publish_fields，前端不在本地维护第二套映射。
  useEffect(() => {
    if (!selectedContent || platformCodes.length === 0) return
    const sortedCodes = [...platformCodes].sort().join(',')
    const fillKey = `${selectedContent.id}|${sortedCodes}`
    if (lastAutoFilledRef.current === fillKey) return
    lastAutoFilledRef.current = fillKey

    // 取首平台的 kind 当预填 kind（多平台时各平台 kind 通常相同；不同的也用首项作模板）
    const firstCode = platformCodes[0]
    const fillKind = kindByPlatform[firstCode] ?? inferredKind
    let cancelled = false
    void (async () => {
      try {
        const filled = await tlfApi.prefill({
          content_id: selectedContent.id,
          platform_codes: platformCodes,
          kind: fillKind,
        })
        // 防过期：await 期间用户切了内容/平台则丢弃本次结果
        if (cancelled || lastAutoFilledRef.current !== fillKey) return
        setTitle(filled.title)
        setDesc(filled.body)
        setVideoUrl(filled.videoUrl || '')
        setCovers(filled.covers)
        setImages(filled.images)
        setTags(filled.tags)
        setAutoFillWarnings(filled.warnings)
      } catch {
        /* 预填失败：保持现有表单，不打断用户 */
      }
    })()
    return () => { cancelled = true }
  }, [selectedContent, platformCodes, kindByPlatform, inferredKind])

  // 自定义模式：切换发布类型时清空 Step3 表单，避免残留之前 library 选择 autofill 的值
  useEffect(() => {
    if (!customKind) return
    setTitle('')
    setDesc('')
    setVideoUrl('')
    setVideoDuration(undefined)
    setCovers([])
    setImages([])
    setTags([])
    setAutoFillWarnings([])
    lastAutoFilledRef.current = null
  }, [customKind])

  // ── 重试预填：带 retry state 时预选平台 + 账号（经 hook hydrate）+ 内容 ──
  useEffect(() => {
    if (!retryState || retryAppliedRef.current) return
    retryAppliedRef.current = true
    const { contentId, platform, accountIds } = retryState
    dc.hydrate({ platforms: [platform], accounts: { [platform]: accountIds } })
    if (contentId) {
      void (async () => {
        try {
          const c = await generationApi.get(contentId)
          setSelectedContent(c)
          setStep(3)  // 内容/平台已就绪，直达文案与账号步骤供复核
        } catch {
          toast.error('原内容已不存在，请重新选择内容')
          setStep(1)
        }
      })()
    } else {
      toast.error('原任务无关联素材，请重新选择内容')
      setStep(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryState])

  // ── 校验（每平台逐个跑一遍 → 合并 + 去重） ──
  const validationIssues = useMemo(() => {
    const all: Array<{
      platformCode: string
      field: string
      level: 'error' | 'warning'
      message: string
    }> = []
    for (const code of platformCodes) {
      const kind = kindByPlatform[code]
      if (!kind) continue
      // 计算该平台 batch 模式下的 statement / visible_type / pre_pub_time（用于 enum 校验）
      const extras = computePerPlatformBatchExtras({
        platformCode: code,
        kind,
        originalChecked,
        aiChecked,
        isPublic,
        scheduleEnabled,
        prePubTimeMs,
      })
      const issues = validatePublishData({
        platformCode: code,
        kind,
        title,
        desc,
        content: kind === 'article' ? desc : undefined,
        images: kind === 'dynamic' ? images : undefined,
        covers: kind === 'video' || kind === 'article' ? covers : undefined,
        videoUrl,
        videoDurationSeconds: videoDuration,
        tags: tags.length > 0 ? tags : undefined,
        visibleType: extras.visible_type ?? null,
        statement: (extras.statement as number | undefined) ?? null,
        prePubTimeMs: extras.pre_pub_time ?? null,
      })
      for (const it of issues) all.push({ platformCode: code, ...it })
    }
    return all
  }, [
    platformCodes, kindByPlatform, title, desc, images, covers, videoUrl, videoDuration,
    tags, originalChecked, aiChecked, isPublic, scheduleEnabled, prePubTimeMs,
  ])
  const hasError = validationIssues.some((v) => v.level === 'error')
  /** 取第一项匹配字段的错误（任意平台），用于行内显示 */
  const errorOf = (field: string) =>
    validationIssues.find((v) => v.field === field && v.level === 'error')

  // 视频缺 URL 是硬性错误
  const videoMissing = dominantKind === 'video' && !videoUrl.trim()

  // 文章 → 正文用「富文本(Tiptap) / Markdown」双模式编辑器（编辑的始终是 Markdown 源）：
  // 支持 HTML 的平台发布时转 HTML，Reddit 等仅 Markdown 的平台直接发 Markdown 原文，都适用。
  const useRichArticleEditor = dominantKind === 'article'

  const canSubmit =
    platformCodes.length > 0 &&
    allPlatformsHaveAccount &&
    !hasError &&
    !videoMissing &&
    !categoryError &&
    title.trim().length > 0 &&
    !submitting

  // ── MediaPicker 回调 ──
  const handlePickerConfirm = (picked: PickedMedia[]) => {
    if (pickerTarget === 'video') {
      setVideoUrl(picked[0]?.url || '')
    } else if (pickerTarget === 'cover') {
      const newUrls = picked.map((p) => p.url)
      // 合并 + 去重 + 截到上限
      const merged = Array.from(new Set([...covers, ...newUrls]))
      setCovers(imagesRange?.max ? merged.slice(0, imagesRange.max) : merged)
    } else if (pickerTarget === 'image') {
      const newUrls = picked.map((p) => p.url)
      const merged = Array.from(new Set([...images, ...newUrls]))
      setImages(imagesRange?.max ? merged.slice(0, imagesRange.max) : merged)
    }
  }

  // 计算 picker maxCount = 剩余可选
  const pickerMaxCount = useMemo(() => {
    if (pickerTarget === 'video') return 1
    if (!imagesRange?.max) return undefined
    const current = pickerTarget === 'cover' ? covers.length : images.length
    return Math.max(0, imagesRange.max - current)
  }, [pickerTarget, imagesRange, covers.length, images.length])

  // ── tag helpers ──
  const addTag = () => {
    const v = tagInput.trim()
    if (!v) return
    if (tags.includes(v)) {
      setTagInput('')
      return
    }
    const max = tagsSpec?.max
    setTags((prev) => (max ? [...prev, v].slice(0, max) : [...prev, v]))
    setTagInput('')
  }
  const removeTag = (idx: number) => setTags((prev) => prev.filter((_, i) => i !== idx))

  // ── 提交（多平台 → 前端并发循环 N 个 tlfApi.publish，每平台 1 个发布任务） ──
  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)

    const results = await Promise.allSettled(
      platformCodes.map(async (code) => {
        const kind = kindByPlatform[code]
        if (!kind) throw new Error(`「${getPlatformName(code)}」不支持当前内容的发布类型`)
        const accountIds = Array.from(selectedAccountIdsByPlatform[code] ?? [])
        const batchExtras = computePerPlatformBatchExtras({
          platformCode: code,
          kind,
          originalChecked,
          aiChecked,
          isPublic,
          scheduleEnabled,
          prePubTimeMs,
        })
        // 仅当该平台支持 tags 时携带（其它平台后端 spec 也会自动 drop）
        // 知乎/抖音文章/易车号文章的「标签」实为上游 topics（话题）字段，需用 topics 下发
        const platformSpec = getKindConstraint(code, kind)
        const carryTags = !!platformSpec?.tags && tags.length > 0
        const tagField = tagsFieldName(code, kind)
        // 内容分类（选了才带；node 去掉 child 再透传）
        const catSel = categorySelByPlatform[code]
        const stripChild = (n: TlfCategoryNode) => {
          const { child: _child, ...rest } = n
          return rest
        }
        return tlfApi.publish({
          content_id: selectedContent?.id,
          platform_code: code,
          publish_kind: kind,
          account_ids: accountIds,
          title: title.trim(),
          body: desc.trim() || undefined,
          ...(kind === 'video' && {
            video_url: videoUrl.trim(),
            cover_urls: covers,
          }),
          // 文章：支持 HTML 的平台把正文(Markdown/纯文本)转成 HTML 下发；其余平台发原文
          ...(kind === 'article' && {
            html_content: articleSupportsHtml(code) ? markdownToHtml(desc) : desc,
            cover_urls: covers,
          }),
          ...(kind === 'dynamic' && {
            media_urls: images,
          }),
          // 批量设置 4 控件经 computePerPlatformBatchExtras 解析的字段
          ...(batchExtras.visible_type !== undefined && { visible_type: batchExtras.visible_type }),
          ...(batchExtras.statement !== undefined && { statement: batchExtras.statement }),
          ...(batchExtras.pre_pub_time !== undefined && { pre_pub_time: batchExtras.pre_pub_time }),
          ...(batchExtras.create_type !== undefined && { create_type: batchExtras.create_type }),
          ...(carryTags && { [tagField]: tags }),
          ...(catSel?.l1 && { category: stripChild(catSel.l1) }),
          ...(catSel?.l2 && { sub_category: stripChild(catSel.l2) }),
          // Reddit 专属：目标版块（subreddit）经 extra 透传
          ...(code === 'Reddit' && redditSubreddit.trim() && { extra: { subreddit: redditSubreddit.trim() } }),
        })
      }),
    )

    const ok = results.filter((r) => r.status === 'fulfilled').length
    const failedDetails = results
      .map((r, i) => ({ r, code: platformCodes[i] }))
      .filter(({ r }) => r.status === 'rejected') as Array<{
        r: PromiseRejectedResult
        code: string
      }>

    if (failedDetails.length === 0) {
      toast.success(`已提交 ${ok} 个发布任务`)
      navigate('/tlf/tasks')
    } else if (ok > 0) {
      const reasons = failedDetails
        .map(({ r, code }) => `${getPlatformName(code)}: ${r.reason instanceof ApiError ? r.reason.message : String(r.reason)}`)
        .join('；')
      toast.error(`成功 ${ok} 个，失败 ${failedDetails.length} 个 —— ${reasons}`)
      navigate('/tlf/tasks')
    } else {
      const reasons = failedDetails
        .map(({ r, code }) => `${getPlatformName(code)}: ${r.reason instanceof ApiError ? r.reason.message : String(r.reason)}`)
        .join('；')
      toast.error(`全部平台提交失败：${reasons}`)
    }
    setSubmitting(false)
  }

  // ── 渲染 ──

  return (
    <PageContainer>
      <PageHeader
        title="发布内容"
        description="选择内容 → 选择平台 → 配置发布，一键提交至云端。"
        icon={Send}
        iconAccent="primary"
        breadcrumbs={[{ label: '创作分发' }, { label: '全球发布' }, { label: '发布内容' }]}
      />

      {/* 步骤指示器 */}
      <div className="mt-6 flex items-center gap-3">
        {[
          { n: 1, label: '选择内容' },
          { n: 2, label: '选择平台' },
          { n: 3, label: '配置发布' },
        ].map(({ n, label }, i) => (
          <div key={n} className="flex items-center gap-3">
            {i > 0 && (
              <div
                className={cn(
                  'h-px w-12 transition-colors',
                  step > i ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-sm font-bold transition',
                  step === n
                    ? 'bg-primary text-primary-foreground'
                    : step > n
                      ? 'bg-emerald-500 text-white'
                      : 'border border-border bg-card text-muted-foreground',
                )}
              >
                {step > n ? <CheckCircle2 className="size-4" /> : n}
              </div>
              <span
                className={cn(
                  'text-sm font-medium',
                  step === n ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ─────────── Step 1：选择内容 ─────────── */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22 }}
            className="mt-6 space-y-5"
          >
            {step1Mode === 'custom' && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep1Mode('library')
                    setCustomKind(null)
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                >
                  <ArrowLeft className="size-4" /> 返回选择已生成内容
                </button>
                <p className="text-sm text-muted-foreground">
                  选择要发布的内容类型，下一步选择平台并手动填写内容（可上传图片 / 视频到资产管理）
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {([
                    { k: 'video' as const, icon: Clapperboard, tone: TYPE_TONE.video, desc: '上传视频 + 封面发布' },
                    { k: 'dynamic' as const, icon: ImageIcon, tone: TYPE_TONE.image, desc: '上传多张图片 + 文案发布' },
                    { k: 'article' as const, icon: FileText, tone: TYPE_TONE.article, desc: '手写正文（支持富文本）发布' },
                  ]).map(({ k, icon: Icon, tone, desc: d }) => {
                    const active = customKind === k
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setCustomKind(k)
                          setSelectedContent(null)
                        }}
                        className={cn(
                          'group flex items-start gap-3 rounded-xl border bg-card p-4 text-left card-hover',
                          active ? 'border-primary ring-2 ring-primary/30' : 'border-border',
                        )}
                      >
                        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', tone)}>
                          <Icon className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{kindLabel(k)}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{d}</p>
                        </div>
                        {active && <CheckCircle2 className="ml-auto size-4 shrink-0 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {step1Mode === 'library' && (
            <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-xl border bg-card p-1">
                {(['all', 'article', 'image', 'video'] as const).map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => {
                      setTypeFilter(tp)
                      setContentPage(1)
                    }}
                    className={cn(
                      'cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium transition',
                      typeFilter === tp
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {tp === 'all'
                      ? '全部'
                      : tp === 'article'
                        ? '文章'
                        : tp === 'image'
                          ? '图片'
                          : '视频'}
                  </button>
                ))}
              </div>
              {/* 右侧：进入自定义发布内容 */}
              <Button
                variant="outline"
                onClick={() => {
                  setStep1Mode('custom')
                  setSelectedContent(null)
                }}
                className="cursor-pointer"
              >
                <Pencil className="size-4" /> 自定义发布内容
              </Button>
            </div>

            {contentsLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="mr-2 size-6 animate-spin" /> 加载中…
              </div>
            ) : contents.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="暂无可发布内容"
                description="先去「创作分发 → 内容库」生成 / 上传内容"
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {contents.map((c, i) => {
                  const Icon = TYPE_ICON[c.type] ?? FileText
                  const tone = TYPE_TONE[c.type] ?? 'text-muted-foreground bg-muted'
                  const selected = selectedContent?.id === c.id
                  const filePath = (c as unknown as { file_path?: string }).file_path
                  const thumb = (c as unknown as { thumbnail_path?: string }).thumbnail_path
                  return (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ y: -3 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => setSelectedContent(selected ? null : c)}
                      className={cn(
                        'group relative cursor-pointer overflow-hidden rounded-xl border bg-card p-3 card-hover',
                        selected
                          ? 'border-primary ring-2 ring-primary/30'
                          : 'border-border',
                      )}
                    >
                      <div className="mb-2.5 flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-muted/40">
                        {c.type === 'article' ? (
                          <div
                            className="group/preview relative size-full cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation()
                              setPreviewItem(c)
                            }}
                          >
                            <div className="line-clamp-4 size-full p-3 text-[11px] leading-relaxed text-muted-foreground">
                              {(c as unknown as { content?: string }).content}
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 transition-opacity group-hover/preview:opacity-100">
                              <span className="rounded-lg bg-white/20 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                                点击预览
                              </span>
                            </div>
                          </div>
                        ) : filePath ? (
                          <img
                            src={c.type === 'video' ? thumb || filePath : filePath}
                            alt={c.title || ''}
                            className="size-full cursor-pointer object-cover"
                            onClick={(e) => {
                              e.stopPropagation()
                              setPreviewItem(c)
                            }}
                          />
                        ) : (
                          <span className={cn('flex size-10 items-center justify-center rounded-lg', tone)}>
                            <Icon className="size-5" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span
                          className={cn(
                            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded',
                            tone,
                          )}
                        >
                          <Icon className="size-3" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{c.title || '未命名'}</p>
                          <p className="text-[11px] text-muted-foreground">{c.type}</p>
                        </div>
                        {selected && <CheckCircle2 className="ml-auto size-4 shrink-0 text-primary" />}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}

            {contentTotal > PAGE_SIZE && (
              <div className="flex items-center justify-center gap-3 text-sm">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={contentPage <= 1}
                  onClick={() => setContentPage((p) => p - 1)}
                  className="cursor-pointer"
                >
                  上一页
                </Button>
                <span className="tabular-nums text-muted-foreground">
                  {contentPage} / {Math.ceil(contentTotal / PAGE_SIZE)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={contentPage >= Math.ceil(contentTotal / PAGE_SIZE)}
                  onClick={() => setContentPage((p) => p + 1)}
                  className="cursor-pointer"
                >
                  下一页
                </Button>
              </div>
            )}
            </>
            )}

            <div className="flex justify-end">
              <Button
                disabled={!selectedContent && !customKind}
                onClick={() => {
                  // 切换内容/类型后，已选平台若不再兼容当前发布类型则清空让 step2 重新选
                  setPlatformCodes((prev) =>
                    prev.filter((c) =>
                      allowedKinds.some((k) => platformSupports(c, k)),
                    ),
                  )
                  setStep(2)
                }}
                className="cursor-pointer"
              >
                下一步：选择平台 <ArrowRight className="size-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* ─────────── Step 2：选择平台（多选） ─────────── */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22 }}
            className="mt-6 space-y-5"
          >
            {/* 已选内容摘要 */}
            {selectedContent && (
              <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-soft">
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    TYPE_TONE[selectedContent.type] || 'bg-muted',
                  )}
                >
                  {(() => {
                    const Icon = TYPE_ICON[selectedContent.type] ?? FileText
                    return <Icon className="size-4" />
                  })()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{selectedContent.title || '未命名'}</p>
                  <p className="text-xs text-muted-foreground">
                    内容类型 {selectedContent.type} · 推荐发布 {kindLabel(inferredKind)}
                  </p>
                </div>
              </div>
            )}

            {/* 自定义内容摘要 */}
            {!selectedContent && customKind && (
              <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-soft">
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    customKind === 'video'
                      ? TYPE_TONE.video
                      : customKind === 'article'
                        ? TYPE_TONE.article
                        : TYPE_TONE.image,
                  )}
                >
                  {(() => {
                    const Icon =
                      customKind === 'video'
                        ? Clapperboard
                        : customKind === 'article'
                          ? FileText
                          : ImageIcon
                    return <Icon className="size-4" />
                  })()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">自定义内容</p>
                  <p className="text-xs text-muted-foreground">发布类型 {kindLabel(customKind)} · 下一步手动填写</p>
                </div>
              </div>
            )}

            {/* 平台多选 + 聚合规范预览（复用组件） */}
            <PlatformPicker dc={dc} />

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="cursor-pointer">
                <ArrowLeft className="size-4" /> 返回选择内容
              </Button>
              <Button
                disabled={platformCodes.length === 0}
                onClick={() => setStep(3)}
                className="cursor-pointer"
              >
                下一步：配置发布 <ArrowRight className="size-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* ─────────── Step 3：配置发布 ─────────── */}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.22 }}
            className="mt-6 space-y-5"
          >
            {/* 平台 + 类型摘要（可改） —— 单平台 / 多平台两种样式 */}
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-soft">
              <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                {isMultiPlatform ? (
                  <>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      已选 <span className="font-semibold text-foreground">{platformCodes.length}</span> 个平台：
                    </span>
                    <div className="flex flex-1 flex-wrap items-center gap-1.5 overflow-hidden">
                      {platformCodes.map((code) => (
                        <span
                          key={code}
                          className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs"
                        >
                          <PlatformLogo code={code} size={15} />
                          <span className="text-foreground">{getPlatformName(code)}</span>
                          <span className="text-muted-foreground">· {kindLabel(kindByPlatform[code] ?? inferredKind)}</span>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <PlatformBadge code={singlePlatformCode} />
                    <span className="text-sm text-muted-foreground">
                      发布类型：
                      <span className="text-foreground/85 font-medium">{kindLabel(singleKind ?? inferredKind)}</span>
                    </span>
                  </>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(2)}
                className="cursor-pointer shrink-0"
              >
                <Pencil className="size-3.5" /> 修改
              </Button>
            </div>

            {/* AI 内容自适应提示（截断 / 媒体不足等） */}
            {autoFillWarnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                  <AlertCircle className="size-4" />
                  {isMultiPlatform
                    ? '已根据所选平台中最严格的规范自动适配内容'
                    : `已根据「${getPlatformName(singlePlatformCode)} · ${kindLabel(singleKind ?? inferredKind)}」规范自动适配内容`}
                </p>
                <ul className="space-y-0.5 pl-5 text-xs text-amber-700/90 dark:text-amber-400/90">
                  {autoFillWarnings.map((w, i) => (
                    <li key={i} className="list-disc">{w.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
              {/* 左列：文案 + 媒体 */}
              <div className="space-y-5">
                <SectionCard title="文案">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="tlf-title">标题</Label>
                        {titleRange?.max !== undefined && (
                          <span
                            className={cn(
                              'text-[11px] tabular-nums',
                              title.length > titleRange.max
                                ? 'text-rose-600'
                                : 'text-muted-foreground',
                            )}
                          >
                            {title.length} / {titleRange.max}
                          </span>
                        )}
                      </div>
                      <Input
                        id="tlf-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="抓人眼球的标题"
                      />
                      {errorOf('title') && (
                        <p className="text-xs text-rose-600">{errorOf('title')!.message}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="tlf-desc">
                          正文
                          {descRange?.required && <span className="ml-1 text-rose-500">*</span>}
                        </Label>
                        {descRange?.max !== undefined && (
                          <span
                            className={cn(
                              'text-[11px] tabular-nums',
                              desc.length > descRange.max
                                ? 'text-rose-600'
                                : 'text-muted-foreground',
                            )}
                          >
                            {desc.length} / {descRange.max}
                          </span>
                        )}
                      </div>
                      {/* 文章 + 支持 HTML 的平台：富文本(Tiptap) / Markdown 双模式编辑器；
                          其余（视频简介 / 图文文案 / 不支持 HTML 的文章）用纯文本框 */}
                      {useRichArticleEditor ? (
                        <>
                          <Suspense
                            fallback={
                              <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-8 text-sm text-muted-foreground">
                                <Loader2 className="size-4 animate-spin" /> 编辑器加载中…
                              </div>
                            }
                          >
                            <ArticleBodyEditor
                              value={desc}
                              onChange={setDesc}
                              disableImages={platformCodes.includes('Reddit')}
                            />
                          </Suspense>
                          {platformCodes.includes('Reddit') ? (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400">
                              Reddit 暂不支持图文混编分发，正文仅发文字 / 链接（图片会被忽略）。
                            </p>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">
                              发布到支持 HTML 的平台时自动转为 HTML，Reddit 等仅 Markdown 的平台发 Markdown 原文
                            </p>
                          )}
                        </>
                      ) : (
                        <Textarea
                          id="tlf-desc"
                          value={desc}
                          onChange={(e) => setDesc(e.target.value)}
                          rows={6}
                          placeholder="支持 emoji 和 #话题，不同平台字数上限不同"
                        />
                      )}
                      {/* 文章正文校验报 field='content'，动态/视频报 'desc'，两者都要显示 */}
                      {(errorOf('desc') || errorOf('content')) && (
                        <p className="text-xs text-rose-600">
                          {(errorOf('desc') || errorOf('content'))!.message}
                        </p>
                      )}
                    </div>
                  </div>
                </SectionCard>

                {/* 视频发布：视频槽 + 封面槽 */}
                {dominantKind === 'video' && (
                  <>
                    <SectionCard title="视频" description="单选；URL 来自所选内容或从媒体库选取">
                      <VideoSlotPanel
                        url={videoUrl}
                        onPickClick={() => setPickerTarget('video')}
                        onUploadDone={(url) => setVideoUrl(url)}
                        onRemove={() => {
                          setVideoUrl('')
                          setVideoDuration(undefined)
                        }}
                        onDuration={setVideoDuration}
                        missing={videoMissing}
                        durationError={errorOf('video')?.message}
                      />
                    </SectionCard>

                    <SectionCard
                      title={imagesRange?.required !== false ? '封面（必填）' : '封面（可选）'}
                      description="多张缩略图；从媒体库选取或上传"
                    >
                      <MediaSlotPanel
                        urls={covers}
                        onPickClick={() => setPickerTarget('cover')}
                        onUploadDone={(url) =>
                          setCovers((prev) =>
                            imagesRange?.max
                              ? Array.from(new Set([...prev, url])).slice(0, imagesRange.max)
                              : Array.from(new Set([...prev, url])),
                          )
                        }
                        onRemoveAt={(i) => setCovers((prev) => prev.filter((_, k) => k !== i))}
                        max={imagesRange?.max}
                        hint={
                          imagesRange
                            ? `视频封面：${
                                imagesRange.min ? `至少 ${imagesRange.min} 张` : '可选'
                              }${imagesRange.max ? `，最多 ${imagesRange.max} 张` : ''}（当前 ${covers.length} 张）${
                                isMultiPlatform ? ' · 按最严格平台限制' : ''
                              }`
                            : ''
                        }
                        errorMsg={errorOf('images')?.message}
                        mediaType="image"
                      />
                    </SectionCard>
                  </>
                )}

                {/* 文章发布：封面槽 */}
                {dominantKind === 'article' && (
                  <SectionCard
                    title={imagesRange?.required ? '封面（必填）' : '封面（可选）'}
                    description="多张缩略图；从媒体库选取或上传"
                  >
                    <MediaSlotPanel
                      urls={covers}
                      onPickClick={() => setPickerTarget('cover')}
                      onUploadDone={(url) =>
                        setCovers((prev) =>
                          imagesRange?.max
                            ? Array.from(new Set([...prev, url])).slice(0, imagesRange.max)
                            : Array.from(new Set([...prev, url])),
                        )
                      }
                      onRemoveAt={(i) => setCovers((prev) => prev.filter((_, k) => k !== i))}
                      max={imagesRange?.max}
                      hint={
                        imagesRange
                          ? `${
                              imagesRange.min ? `至少 ${imagesRange.min} 张` : '可选'
                            }${imagesRange.max ? `，最多 ${imagesRange.max} 张` : ''}（当前 ${covers.length} 张）${
                              isMultiPlatform ? ' · 按最严格平台限制' : ''
                            }`
                          : ''
                      }
                      errorMsg={errorOf('images')?.message}
                      mediaType="image"
                    />
                  </SectionCard>
                )}

                {/* 图文发布：图片槽 */}
                {dominantKind === 'dynamic' && (
                  <SectionCard
                    title={imagesRange?.required ? '图片（必填）' : '图片（可选）'}
                    description="多张缩略图；从媒体库选取或上传"
                  >
                    <MediaSlotPanel
                      urls={images}
                      onPickClick={() => setPickerTarget('image')}
                      onUploadDone={(url) =>
                        setImages((prev) =>
                          imagesRange?.max
                            ? Array.from(new Set([...prev, url])).slice(0, imagesRange.max)
                            : Array.from(new Set([...prev, url])),
                        )
                      }
                      onRemoveAt={(i) => setImages((prev) => prev.filter((_, k) => k !== i))}
                      max={imagesRange?.max}
                      hint={
                        imagesRange
                          ? `图文发布：${
                              imagesRange.min ? `至少 ${imagesRange.min} 张` : '可选'
                            }${imagesRange.max ? `，最多 ${imagesRange.max} 张` : ''}（当前 ${images.length} 张）${
                              isMultiPlatform ? ' · 按最严格平台限制' : ''
                            }`
                          : ''
                      }
                      errorMsg={errorOf('images')?.message}
                      mediaType="image"
                    />
                  </SectionCard>
                )}

                {/* 标签（B 站 / CSDN / 知乎 等需要） */}
                {tagsSpec && (
                  <SectionCard
                    title={tagsSpec.required ? '标签（必填）' : '标签（可选）'}
                    description={
                      `${tagsSpec.min ? `至少 ${tagsSpec.min} 个` : ''}${
                        tagsSpec.max ? `，最多 ${tagsSpec.max} 个` : ''
                      }${tagsSpec.itemMaxLength ? ` · 每个 ≤ ${tagsSpec.itemMaxLength} 字` : ''}`.replace(/^，/, '')
                    }
                  >
                    <div className="space-y-3">
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map((tag, i) => (
                            <span
                              key={`${tag}-${i}`}
                              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary"
                            >
                              {tag}
                              <button
                                type="button"
                                onClick={() => removeTag(i)}
                                className="cursor-pointer hover:text-rose-600"
                                aria-label="移除标签"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              addTag()
                            }
                          }}
                          placeholder="输入标签后回车添加"
                          maxLength={tagsSpec.itemMaxLength}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={addTag}
                          disabled={!tagInput.trim() || (tagsSpec.max != null && tags.length >= tagsSpec.max)}
                          className="cursor-pointer"
                        >
                          添加
                        </Button>
                      </div>
                      {errorOf('tags') && (
                        <p className="text-xs text-rose-600">{errorOf('tags')!.message}</p>
                      )}
                    </div>
                  </SectionCard>
                )}

                {/* 内容分类 + 批量设置（复用组件；定时仅 publish 模式显示） */}
                <DistributionSettings dc={dc} prePubError={errorOf('pre_pub_time')?.message} />

              </div>

              {/* 右列：每平台账号卡片 + 提交 */}
              <div className="space-y-5">
                <AccountPicker dc={dc} />

                <div className="space-y-2">
                  <Button
                    size="lg"
                    disabled={!canSubmit}
                    onClick={() => void handleSubmit()}
                    className="w-full cursor-pointer"
                  >
                    {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    {isMultiPlatform
                      ? `提交发布（${platformCodes.length} 平台 · ${totalSelectedAccounts} 个账号）`
                      : `提交发布（${totalSelectedAccounts} 个账号）`}
                  </Button>
                  {hasError && (
                    <p className="text-center text-xs text-rose-600">
                      还有 {validationIssues.filter((v) => v.level === 'error').length} 项内容不符合所选平台要求
                    </p>
                  )}
                  {!allPlatformsHaveAccount && platformCodes.length > 0 && (
                    <p className="text-center text-xs text-amber-600 dark:text-amber-400">
                      每个平台至少需要选择 1 个账号
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-start">
              <Button variant="outline" onClick={() => setStep(2)} className="cursor-pointer">
                <ArrowLeft className="size-4" /> 返回选择平台
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 文章预览 */}
      {previewItem?.type === 'article' && (
        <ArticlePreviewModal
          content={(previewItem as unknown as { content?: string }).content || ''}
          title={previewItem.title || '无标题'}
          onClose={() => setPreviewItem(null)}
        />
      )}

      {/* 媒体预览 */}
      {previewItem && previewItem.type !== 'article' &&
        (previewItem as unknown as { file_path?: string }).file_path && (
          <MediaPreview
            url={(previewItem as unknown as { file_path: string }).file_path}
            type={previewItem.type === 'video' ? 'video' : 'image'}
            alt={previewItem.title || ''}
            onClose={() => setPreviewItem(null)}
          />
        )}

      {/* MediaPicker 抽屉 */}
      <MediaPicker
        open={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        type={pickerTarget === 'video' ? 'video' : 'image'}
        multiple={pickerTarget !== 'video'}
        maxCount={pickerMaxCount}
        selectedUrls={
          pickerTarget === 'video'
            ? videoUrl
              ? [videoUrl]
              : []
            : pickerTarget === 'cover'
              ? covers
              : pickerTarget === 'image'
                ? images
                : []
        }
        onConfirm={handlePickerConfirm}
      />
    </PageContainer>
  )
}

/* ──────────────────────────────────────────────
 * 子组件：视频槽
 * ────────────────────────────────────────────── */
function VideoSlotPanel({
  url,
  onPickClick,
  onUploadDone,
  onRemove,
  onDuration,
  missing,
  durationError,
}: {
  url: string
  onPickClick: () => void
  onUploadDone: (url: string) => void
  onRemove: () => void
  onDuration?: (seconds: number | undefined) => void
  missing: boolean
  durationError?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      // 上传即落「资产管理/视频」(source=upload)，响应已带可直接发布的公开 file_path
      // （封面/元数据后台异步生成，发布视频本身不依赖它），直接选入当前视频槽
      const res = (await videosApi.upload(file)) as { file_path?: string }
      if (res?.file_path) {
        onUploadDone(res.file_path)
        toast.success('已上传到媒体库并选用')
      } else {
        toast.success('已上传，处理完成后可在媒体库选取')
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '上传失败')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  return (
    <div className="space-y-3">
      {url ? (
        <div className="relative overflow-hidden rounded-lg border bg-black">
          <video
            src={url}
            controls
            className="max-h-80 w-full bg-black"
            onLoadedMetadata={(e) => {
              const d = (e.target as HTMLVideoElement).duration
              onDuration?.(Number.isFinite(d) ? d : undefined)
            }}
            onError={() => {
              // 跨域 / 无法本地播放时拿不到时长，清空让云端判定
              onDuration?.(undefined)
            }}
          />
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-2 top-2 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
            aria-label="移除视频"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-8 text-sm text-muted-foreground">
          <VideoIcon className="size-8 opacity-50" />
          <p>尚未选择视频</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onPickClick}
          className="cursor-pointer"
        >
          <FolderOpen className="size-4" /> 从媒体库选择
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="cursor-pointer"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          上传到媒体库
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleUpload(f)
          }}
        />
      </div>
      {missing && (
        <p className="flex items-center gap-1.5 text-xs text-rose-600">
          <AlertCircle className="size-3.5" /> 视频必填
        </p>
      )}
      {durationError && (
        <p className="flex items-center gap-1.5 text-xs text-rose-600">
          <AlertCircle className="size-3.5" /> {durationError}
        </p>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────
 * 子组件：通用媒体多选槽（图片）
 * ────────────────────────────────────────────── */
function MediaSlotPanel({
  urls,
  onPickClick,
  onUploadDone,
  onRemoveAt,
  max,
  hint,
  errorMsg,
  mediaType,
}: {
  urls: string[]
  onPickClick: () => void
  onUploadDone: (url: string) => void
  onRemoveAt: (idx: number) => void
  max?: number
  hint?: string
  errorMsg?: string
  mediaType: 'image' | 'video'
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const reachMax = max !== undefined && urls.length >= max
  const api = mediaType === 'image' ? imagesApi : videosApi
  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      // 上传即落「资产管理」(source=upload)，响应已带可直接发布的公开 file_path
      // （缩略图/CLIP 后台异步生成，不影响发布），直接选入当前媒体槽
      const res = (await api.upload(file)) as { file_path?: string }
      if (res?.file_path) {
        onUploadDone(res.file_path)
        toast.success('已上传到媒体库并选用')
      } else {
        toast.success('已上传，处理完成后可在媒体库选取')
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '上传失败')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  return (
    <div className="space-y-3">
      {urls.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {urls.map((url, i) => (
            <div
              key={`${url}-${i}`}
              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted/40"
            >
              <img
                src={url}
                alt=""
                className="size-full object-cover"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
              <button
                type="button"
                onClick={() => onRemoveAt(i)}
                className="absolute right-1 top-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                aria-label="移除"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onPickClick}
          disabled={reachMax}
          className="cursor-pointer"
        >
          <FolderOpen className="size-4" /> 从媒体库选择
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="cursor-pointer"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          上传到媒体库
        </Button>
        {urls.length > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // 从后往前删，避免索引偏移
              for (let i = urls.length - 1; i >= 0; i--) onRemoveAt(i)
            }}
            className="cursor-pointer"
          >
            <Trash2 className="size-4" /> 清空
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={mediaType === 'image' ? 'image/*' : 'video/*'}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleUpload(f)
          }}
        />
      </div>
      {(errorMsg || hint) && (
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs',
            errorMsg ? 'text-rose-600' : 'text-muted-foreground',
          )}
        >
          {errorMsg ? <AlertCircle className="size-3.5" /> : null}
          {errorMsg || hint}
        </p>
      )}
    </div>
  )
}
