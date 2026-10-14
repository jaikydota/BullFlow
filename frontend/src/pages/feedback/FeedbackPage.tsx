import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bug,
  ImagePlus,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Send,
  X,
} from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Input } from '@/components/common/Input'
import { toast } from '@/components/common/Toast'
import { MediaPreview } from '@/components/common/MediaPreview'
import { PageContainer, PageHeader } from '@/components/shared'
import { SectionCard } from '@/components/shared/SectionCard'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { feedbackApi, type FeedbackCategory, type FeedbackItem } from '@/api/feedback'
import { uploadsApi } from '@/api/uploads'
import { ALLOWED_IMAGE_TYPES } from '@/utils/constants'
import { ApiError } from '@/types/api'
import { formatDate } from '@/utils/format'
import { cn } from '@/lib/utils'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 与后端 /uploads/image 一致
const MAX_IMAGES = 9

// 粘贴快捷键文案：macOS 显示 Command + V，其它平台 Ctrl + V
const PASTE_KEY =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '')
    ? 'Command + V'
    : 'Ctrl + V'

export default function FeedbackPage() {
  const { t } = useTranslation()

  const categories: { value: FeedbackCategory; label: string; icon: typeof Lightbulb }[] = [
    { value: 'suggestion', label: t('feedback.catSuggestion', '功能建议'), icon: Lightbulb },
    { value: 'bug', label: t('feedback.catBug', '问题反馈'), icon: Bug },
    { value: 'other', label: t('feedback.catOther', '其他'), icon: MoreHorizontal },
  ]

  const [category, setCategory] = useState<FeedbackCategory>('suggestion')
  const [content, setContent] = useState('')
  const [contact, setContact] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  // 历史反馈图片预览（每条反馈各自一组图）
  const [historyPreview, setHistoryPreview] = useState<{ images: string[]; index: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [history, setHistory] = useState<FeedbackItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await feedbackApi.list(1, 20)
      setHistory(res.items)
    } catch {
      // 历史加载失败不打断主流程
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const imgs = files.filter((f) => f.type.startsWith('image/'))
      if (imgs.length === 0) return
      const room = MAX_IMAGES - images.length
      if (room <= 0) {
        toast.error(t('feedback.maxImages', '最多上传 {{n}} 张图片', { n: MAX_IMAGES }))
        return
      }
      const accepted: File[] = []
      for (const f of imgs.slice(0, room)) {
        if (!ALLOWED_IMAGE_TYPES.includes(f.type)) {
          toast.error(t('feedback.badImageType', '仅支持 PNG / JPG / WebP / GIF 图片'))
          continue
        }
        if (f.size > MAX_IMAGE_SIZE) {
          toast.error(t('feedback.imageTooLarge', '单张图片不能超过 5MB'))
          continue
        }
        accepted.push(f)
      }
      if (accepted.length === 0) return
      setUploading(true)
      try {
        for (const f of accepted) {
          const res = await uploadsApi.uploadImage(f)
          setImages((prev) => (prev.length >= MAX_IMAGES ? prev : [...prev, res.url]))
        }
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : t('feedback.uploadFailed', '图片上传失败'))
      } finally {
        setUploading(false)
      }
    },
    [images.length, t],
  )

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      void uploadFiles(files)
    }
  }

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) void uploadFiles(files)
    e.target.value = ''
  }

  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx))

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error(t('feedback.contentRequired', '请填写反馈内容'))
      return
    }
    setSubmitting(true)
    try {
      await feedbackApi.submit({
        category,
        content: content.trim(),
        images,
        contact: contact.trim() || undefined,
      })
      toast.success(t('feedback.submitted', '感谢您的反馈，我们会尽快处理！'))
      setContent('')
      setContact('')
      setImages([])
      setCategory('suggestion')
      void loadHistory()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('common.failed', '操作失败'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageContainer size="md">
      <PageHeader
        title={t('feedback.title', '意见反馈')}
        description={t('feedback.subtitle', '功能建议、问题反馈都可以告诉我们，可上传截图（支持 {{paste}} 粘贴）', { paste: PASTE_KEY })}
        icon={MessageSquarePlus}
        iconAccent="primary"
      />

      <SectionCard>
        <div className="space-y-5" onPaste={handlePaste}>
          {/* 类型选择 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {t('feedback.category', '反馈类型')}
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const Icon = c.icon
                const active = category === c.value
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={cn(
                      'flex cursor-pointer items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4" strokeWidth={2.1} />
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 内容 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {t('feedback.content', '反馈内容')}
              <span className="text-destructive"> *</span>
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              maxLength={5000}
              placeholder={t(
                'feedback.contentPlaceholder',
                '请详细描述您遇到的问题或建议，可直接 {{paste}} 粘贴截图…',
                { paste: PASTE_KEY },
              )}
              className="resize-none"
            />
            <p className="text-right text-xs text-muted-foreground">{content.length}/5000</p>
          </div>

          {/* 图片 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {t('feedback.images', '截图')}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {t('feedback.imagesHint', '可选，最多 {{n}} 张', { n: MAX_IMAGES })}
              </span>
            </label>
            <div className="flex flex-wrap gap-3">
              {images.map((url, idx) => (
                <div
                  key={url}
                  className="group relative size-24 overflow-hidden rounded-lg border border-border bg-muted/30"
                >
                  <img
                    src={url}
                    alt=""
                    className="size-full cursor-pointer object-cover"
                    onClick={() => setPreviewIndex(idx)}
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute right-1 top-1 flex size-5 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={t('common.delete', '删除')}
                  >
                    <X className="size-3" strokeWidth={2.5} />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <ImagePlus className="size-5" strokeWidth={2.1} />
                  )}
                  <span className="text-xs">{t('feedback.addImage', '添加')}</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleFilePick}
            />
          </div>

          {/* 联系方式（可选） */}
          <Input
            label={t('feedback.contact', '联系方式（可选）')}
            hint={t('feedback.contactHint', '留下手机号 / 微信 / 邮箱，方便我们与您联系')}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={t('feedback.contactPlaceholder', '选填')}
            maxLength={255}
          />

          <div className="flex justify-end pt-1">
            <Button variant="primary" loading={submitting} onClick={() => void handleSubmit()}>
              <Send className="size-4" strokeWidth={2.1} />
              {t('feedback.submit', '提交反馈')}
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* 历史 */}
      <SectionCard
        title={t('feedback.history', '我的反馈')}
        description={t('feedback.historyDesc', '查看提交记录与处理进度')}
        className="mt-6"
      >
        {historyLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('feedback.empty', '还没有提交过反馈')}
          </p>
        ) : (
          <ul className="space-y-3">
            {history.map((fb) => (
              <li key={fb.id} className="rounded-lg border border-border bg-card/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-foreground">
                    {fb.content}
                  </p>
                  {fb.status === 'resolved' ? (
                    <Badge className="shrink-0 border-emerald-500/20 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      {t('feedback.statusResolved', '已处理')}
                    </Badge>
                  ) : (
                    <Badge className="shrink-0 border-amber-500/20 bg-amber-500/15 text-amber-700 dark:text-amber-300">
                      {t('feedback.statusPending', '待处理')}
                    </Badge>
                  )}
                </div>
                {fb.images && fb.images.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {fb.images.map((url, i) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setHistoryPreview({ images: fb.images ?? [], index: i })}
                        className="size-14 cursor-pointer overflow-hidden rounded-md border border-border transition-colors hover:border-primary"
                      >
                        <img src={url} alt="" className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                {fb.reply && (
                  <div className="mt-3 rounded-md bg-primary/5 px-3 py-2 text-sm">
                    <span className="font-medium text-primary">
                      {t('feedback.officialReply', '官方回复')}：
                    </span>
                    <span className="whitespace-pre-wrap break-words text-foreground/85">{fb.reply}</span>
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">{formatDate(fb.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {previewIndex !== null && (
        <MediaPreview
          items={images.map((url) => ({ url, type: 'image' as const }))}
          startIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onDelete={(idx) => {
            removeImage(idx)
            setPreviewIndex(null)
          }}
        />
      )}

      {historyPreview && (
        <MediaPreview
          items={historyPreview.images.map((url) => ({ url, type: 'image' as const }))}
          startIndex={historyPreview.index}
          onClose={() => setHistoryPreview(null)}
        />
      )}
    </PageContainer>
  )
}
