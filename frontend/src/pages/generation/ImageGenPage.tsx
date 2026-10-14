import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CheckCircle2, Eye, ImageIcon, Library, Wand2, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/common/Button'
import { GenerationConfigPanel } from '@/components/generation/GenerationConfigPanel'
import { defaultGenConfig, type GenerationConfig } from '@/components/generation/genConfig'
import { MediaPreview } from '@/components/common/MediaPreview'
import { trackEvent, EVENTS } from '@/utils/tracking'
import { toast } from '@/components/common/Toast'
import { generationApi } from '@/api/generation'
import { uploadsApi } from '@/api/uploads'
import type { GeneratedContent } from '@/types/generation'
import { PageContainer, PageHeader } from '@/components/shared'
import { ROUTES } from '@/utils/constants'

type GenState = 'idle' | 'submitting' | 'polling' | 'done' | 'error'

export default function ImageGenPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [config, setConfig] = useState<GenerationConfig>(() => defaultGenConfig('image'))
  const [genState, setGenState] = useState<GenState>('idle')
  const [recordId, setRecordId] = useState<string | null>(null)
  const [record, setRecord] = useState<GeneratedContent | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | undefined>()
  const [showLightbox, setShowLightbox] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const busy = genState === 'submitting' || genState === 'polling'

  // 完成后展示的全部图片（多图取 media_urls，单图回退 file_path）
  const images: string[] =
    record?.media_urls && record.media_urls.length > 0
      ? (record.media_urls.filter(Boolean) as string[])
      : previewUrl
        ? [previewUrl]
        : []

  // 轮询：recordId 设置后启动
  useEffect(() => {
    if (recordId === null) return
    const generationId = recordId
    let cancelled = false

    async function tick() {
      try {
        const g = await generationApi.get(generationId)
        if (cancelled) return
        setRecord(g)
        if (g.status === 'completed') {
          const url = g.file_path ?? g.thumbnail_path
          if (url) setPreviewUrl(url)
          setGenState('done')
          trackEvent(EVENTS.GENERATION_SUCCESS, { type: 'image' })
          toast.success(t('generation.imageReady', '图片已生成'))
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        } else if (g.status === 'failed') {
          setGenState('error')
          trackEvent(EVENTS.GENERATION_FAILED, { type: 'image', error: g.error_message })
          toast.error(g.error_message || t('generation.imageFailed', '图片生成失败'))
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        }
      } catch { /* ignore transient errors */ }
    }

    void tick()
    pollRef.current = setInterval(tick, 3000)
    return () => {
      cancelled = true
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [recordId, t])

  const handleGenerate = useCallback(async () => {
    if (!config.prompt.trim()) {
      toast.error(t('generation.promptRequired', '请输入提示词'))
      return
    }
    setGenState('submitting')
    setRecord(null)
    setRecordId(null)
    setPreviewUrl(undefined)

    try {
      // 解析参考图 URL：媒体库项已有 url 直接用，本地上传项先传 MinIO
      const refs = config.refImages ?? []
      const refUrls = refs.length
        ? await Promise.all(refs.map(async (it) => it.url ?? (await uploadsApi.uploadImage(it.file as File)).url))
        : undefined

      const data = (await generationApi.generateImage({
        prompt: config.prompt.trim(),
        reference: config.reference,
        provider: config.provider,
        size: config.size,
        image_urls: refUrls,
        skill_id: config.skillId,
        template_label: config.templateLabel || undefined,
        title: config.prompt.trim().slice(0, 100),
        count: config.count,
        as_dynamic: config.asDynamic,
      })) as unknown as { id: string; status: string }

      setRecordId(data.id)
      setGenState('polling')
      trackEvent(EVENTS.CREATE_PROJECT, { type: 'image' })
      trackEvent(EVENTS.GENERATION_START, { type: 'image', count: config.count })
    } catch (e) {
      setGenState('error')
      toast.error((e as Error).message || t('generation.imageFailed', '图片生成失败'))
    }
  }, [config, t])

  return (
    <PageContainer size="xl">
      <PageHeader
        title={t('menu.imageGen', '图文生成')}
        description={t(
          'generation.imageSubtitle',
          '描述画面生成单图或多图，可勾选「生成发布动态」打包成图文并自动配文案；支持参考图与创作大师。',
        )}
        icon={ImageIcon}
        iconAccent="image"
        breadcrumbs={[{ label: '创作分发' }, { label: '内容创作' }, { label: t('menu.imageGen', '图文生成') }]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* 左侧配置 */}
        <section className="space-y-5 card-elevated p-5">
          <GenerationConfigPanel contentType="image" value={config} onChange={setConfig} disabled={busy} />

          <Button
            type="button"
            variant="primary"
            size="lg"
            className={
              config.prompt.trim() && !busy
                ? 'w-full bg-emerald-500 text-white hover:bg-emerald-600'
                : 'w-full bg-muted text-muted-foreground hover:bg-muted'
            }
            disabled={!config.prompt.trim() || busy}
            loading={busy}
            onClick={handleGenerate}
          >
            <Wand2 className="size-4" aria-hidden />
            {busy ? t('generation.generating', '生成中…') : t('generation.generate', '生成')}
          </Button>
        </section>

        {/* 右侧预览 */}
        <aside className="space-y-3">
          <div className="card-elevated overflow-hidden">
            {/* 预览区 */}
            <div className="relative aspect-square w-full bg-muted/40">
              <AnimatePresence mode="wait">
                {busy ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-4"
                  >
                    <div className="relative flex size-16 items-center justify-center">
                      <div className="absolute inset-0 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-500" />
                      <ImageIcon className="size-7 text-emerald-500/60" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground/80">
                        {genState === 'submitting' ? '正在提交任务…' : t('generation.imageWorking', '图片生成中，请稍候…')}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {record?.status === 'generating' ? '渲染中' : genState === 'polling' ? '排队等候' : '上传参考图…'}
                      </p>
                    </div>
                    {/* 进度条 */}
                    <div className="w-40 h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full animate-pulse rounded-full bg-gradient-to-r from-emerald-500 to-primary" />
                    </div>
                  </motion.div>
                ) : genState === 'done' && previewUrl ? (
                  <motion.img
                    key="image"
                    initial={{ opacity: 0, scale: 1.02 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    src={previewUrl}
                    alt={config.prompt}
                    className="absolute inset-0 h-full w-full object-cover cursor-pointer"
                    onClick={() => { setLightboxIndex(0); setShowLightbox(true) }}
                  />
                ) : genState === 'error' ? (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                  >
                    <XCircle className="size-10 text-destructive/60" />
                    <p className="text-sm text-destructive/80">{t('generation.imageFailed', '生成失败，请重试')}</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center"
                  >
                    <div className="flex size-16 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
                      <ImageIcon className="size-8 text-emerald-500/50" />
                    </div>
                    <p className="text-sm text-muted-foreground/70">{t('generation.noImageYet', '填写提示词后点击「生成」')}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 完成状态角标 */}
              {genState === 'done' && (
                <div className="absolute top-3 left-3">
                  <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 backdrop-blur-sm">
                    <CheckCircle2 className="size-3" />
                    {images.length > 1
                      ? `${t('generation.imageReady', '已生成')} ${images.length} ${t('generation.imagesUnit', '张')}`
                      : t('generation.imageReady', '已生成')}
                  </span>
                </div>
              )}
            </div>

            {/* 多图缩略图条 */}
            {genState === 'done' && images.length > 1 && (
              <div className="flex flex-wrap gap-2 border-t border-border p-3">
                {images.map((u, i) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => { setLightboxIndex(i); setShowLightbox(true) }}
                    className="size-14 cursor-pointer overflow-hidden rounded-lg border border-border transition-app hover:border-emerald-500/40"
                  >
                    <img src={u} alt={`${config.prompt} ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}

            {/* 操作栏 */}
            <div className="p-3 space-y-2 border-t border-border">
              {/* 发布文案：勾选「生成发布动态」后会有文案 + 话题标签，可一键复制 */}
              {genState === 'done' && record?.description && (
                <div className="space-y-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground/80">
                      {record.layout === 'dynamic' ? '发布文案（图文动态）' : '发布文案'}
                    </span>
                    <button
                      type="button"
                      onClick={() => { void navigator.clipboard?.writeText(record.description ?? ''); toast.success('文案已复制') }}
                      className="cursor-pointer text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      复制
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{record.description}</p>
                  {record.tags && record.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {record.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {genState === 'done' && previewUrl && (
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowLightbox(true)}
                >
                  <Eye className="size-4" />
                  {t('generation.preview', '全屏预览')}
                </Button>
              )}
              <button
                type="button"
                onClick={() => navigate(recordId ? `${ROUTES.GENERATION_LIBRARY}/${recordId}` : ROUTES.GENERATION_LIBRARY)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-muted-foreground transition-app hover:border-emerald-500/30 hover:text-foreground"
              >
                <div className="flex items-center gap-2">
                  <Library className="size-4 text-emerald-500" />
                  {t('chat.viewDetail', '查看详情')}
                </div>
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* 全屏灯箱（多图走 items 轮播） */}
      {showLightbox && images.length > 0 && (
        <MediaPreview
          items={images.map((u) => ({ url: u, type: 'image' as const, label: config.prompt }))}
          startIndex={lightboxIndex}
          onClose={() => setShowLightbox(false)}
        />
      )}
    </PageContainer>
  )
}
