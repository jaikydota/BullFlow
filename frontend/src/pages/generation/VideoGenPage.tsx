import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CheckCircle2, Clapperboard, Eye, Library, Play, Wand2, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/common/Button'
import { GenerationConfigPanel } from '@/components/generation/GenerationConfigPanel'
import { defaultGenConfig, type GenerationConfig } from '@/components/generation/genConfig'
import type { RefImage } from '@/components/generation/MultiRefImageUpload'
import { MediaPreview } from '@/components/common/MediaPreview'
import { toast } from '@/components/common/Toast'
import { trackEvent, EVENTS } from '@/utils/tracking'
import { generationApi } from '@/api/generation'
import { uploadsApi } from '@/api/uploads'
import type { GeneratedContent, VideoGenCreateResponse } from '@/types/generation'
import { useTaskPolling } from '@/hooks/useTaskPolling'
import type { Task } from '@/types/task'
import { PageContainer, PageHeader } from '@/components/shared'
import { ROUTES } from '@/utils/constants'

type GenState = 'idle' | 'submitting' | 'polling' | 'done' | 'error'

function videoUrlFromRecord(g: GeneratedContent): string | undefined {
  if (g.file_path) return g.file_path
  const p = g.parameters
  if (p && typeof p === 'object' && p !== null) {
    const o = p as Record<string, unknown>
    if (typeof o.remote_url === 'string') return o.remote_url
  }
  return undefined
}

export default function VideoGenPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [config, setConfig] = useState<GenerationConfig>(() => defaultGenConfig('video'))
  const [genState, setGenState] = useState<GenState>('idle')
  const [recordId, setRecordId] = useState<string | null>(null)
  const [record, setRecord] = useState<GeneratedContent | null>(null)
  const [videoSrc, setVideoSrc] = useState<string | undefined>()
  const [queueTaskId, setQueueTaskId] = useState<string | null>(null)
  const [showLightbox, setShowLightbox] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { task: queueTask } = useTaskPolling(queueTaskId, {
    interval: 4000,
    onComplete: (task: Task) => {
      const url =
        task.result && typeof task.result === 'object' && task.result !== null
          ? (task.result as Record<string, unknown>).video_url ??
            (task.result as Record<string, unknown>).url
          : undefined
      if (typeof url === 'string') {
        setVideoSrc(url)
        setGenState('done')
        toast.success(t('generation.videoReady', '视频已生成'))
      }
      setQueueTaskId(null)
    },
    onFailed: () => {
      setGenState('error')
      toast.error(t('generation.videoFailed', '视频生成失败'))
      setQueueTaskId(null)
    },
  })

  useEffect(() => {
    if (recordId === null) return
    const generationId = recordId
    let cancelled = false

    async function tick() {
      try {
        const g = await generationApi.get(generationId)
        if (cancelled) return
        setRecord(g)
        const url = videoUrlFromRecord(g)
        if (url) setVideoSrc(url)
        if (g.status === 'completed') {
          if (url) {
            setGenState('done')
            trackEvent(EVENTS.GENERATION_SUCCESS, { type: 'video' })
            toast.success(t('generation.videoReady', '视频已生成'))
          }
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        }
        if (g.status === 'failed') {
          setGenState('error')
          trackEvent(EVENTS.GENERATION_FAILED, { type: 'video', error: g.error_message })
          toast.error(g.error_message || t('generation.videoFailed', '视频生成失败'))
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        }
      } catch { /* ignore transient errors */ }
    }

    void tick()
    pollRef.current = setInterval(tick, 5000)
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
    setVideoSrc(undefined)

    try {
      // 首帧 / 尾帧（尾帧须与首帧成对，无首帧时忽略尾帧）；媒体库项直接用 url，本地项先上传
      const resolve = async (arr: RefImage[] | undefined): Promise<string | undefined> => {
        const it = arr?.[0]
        if (!it) return undefined
        return it.url ?? (await uploadsApi.uploadImage(it.file as File)).url
      }
      let firstUrl: string | undefined
      let lastUrl: string | undefined
      if (config.firstFrame?.length) {
        firstUrl = await resolve(config.firstFrame)
        if (config.lastFrame?.length) lastUrl = await resolve(config.lastFrame)
      }

      const res = (await generationApi.generateVideo({
        prompt: config.prompt.trim(),
        reference: config.reference,
        provider: config.provider,
        resolution: config.resolution,
        duration: config.duration,
        enable_audio: config.enableAudio,
        image_url: firstUrl,
        last_image_url: lastUrl,
        skill_id: config.skillId,
        template_label: config.templateLabel || undefined,
        title: config.prompt.trim().slice(0, 100),
      })) as unknown as VideoGenCreateResponse & { task_id?: string }

      setRecordId(res.id)
      setGenState('polling')
      if (typeof res.task_id === 'string') setQueueTaskId(res.task_id)
      trackEvent(EVENTS.CREATE_PROJECT, { type: 'video' })
      trackEvent(EVENTS.GENERATION_START, { type: 'video' })
    } catch (e) {
      setGenState('error')
      toast.error((e as Error).message || t('generation.videoFailed', '视频生成失败'))
    }
  }, [config, t])

  const isGenerating = genState === 'submitting' || genState === 'polling'
  const progressPct =
    (queueTask as Task | null)?.progress != null
      ? Math.round((queueTask as Task).progress ?? 0)
      : record?.status === 'generating' ? 55 : undefined

  return (
    <PageContainer size="xl">
      <PageHeader
        title={t('menu.videoGen', '视频生成')}
        description={t(
          'generation.videoSubtitle',
          '文生视频 / 图生视频，可选首帧、尾帧参考图，支持创作大师与参考内容；后台异步生成，完成自动展示。',
        )}
        icon={Clapperboard}
        iconAccent="video"
        breadcrumbs={[{ label: '创作分发' }, { label: '内容创作' }, { label: t('menu.videoGen', '视频生成') }]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* 左侧配置 */}
        <section className="space-y-5 card-elevated p-5">
          <GenerationConfigPanel contentType="video" value={config} onChange={setConfig} disabled={isGenerating} />

          <Button
            type="button"
            variant="primary"
            size="lg"
            className={
              config.prompt.trim() && !isGenerating
                ? 'w-full bg-rose-500 text-white hover:bg-rose-600'
                : 'w-full bg-muted text-muted-foreground hover:bg-muted'
            }
            disabled={!config.prompt.trim() || isGenerating}
            loading={isGenerating}
            onClick={handleGenerate}
          >
            <Wand2 className="size-4" aria-hidden />
            {isGenerating ? t('generation.generating', '生成中…') : t('generation.generate', '生成')}
          </Button>
        </section>

        {/* 右侧预览 */}
        <aside className="space-y-3">
          <div className="card-elevated overflow-hidden">
            {/* 状态预览框 */}
            <div className="relative flex min-h-[220px] items-center justify-center bg-muted/40">
              <AnimatePresence mode="wait">
                {isGenerating ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex w-full flex-col items-center gap-4 px-6 py-8"
                  >
                    <div className="relative flex size-16 items-center justify-center">
                      <div className="absolute inset-0 animate-spin rounded-full border-2 border-rose-500/20 border-t-rose-500" />
                      <Clapperboard className="size-7 text-rose-500/60" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground/80">
                        {genState === 'submitting'
                          ? '正在提交任务…'
                          : t('generation.videoWorking', '视频生成中，请稍候…')}
                      </p>
                      {record?.status && (
                        <p className="text-xs text-muted-foreground/70 mt-1">{record.status === 'generating' ? '渲染中' : '排队等候'}</p>
                      )}
                    </div>
                    {/* 进度条 */}
                    <div className="w-full max-w-[200px] space-y-1.5">
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        {progressPct != null ? (
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-500"
                            style={{ width: `${progressPct}%` }}
                          />
                        ) : (
                          <div className="h-full w-3/5 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 animate-pulse" />
                        )}
                      </div>
                      {progressPct != null && (
                        <p className="text-center text-xs text-muted-foreground/70">{progressPct}%</p>
                      )}
                    </div>
                  </motion.div>
                ) : genState === 'done' ? (
                  videoSrc ? (
                    <motion.div
                      key="done"
                      initial={{ opacity: 0, scale: 1.02 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0"
                    >
                      {record?.thumbnail_path ? (
                        <img
                          src={record.thumbnail_path}
                          alt=""
                          className="h-full w-full object-cover cursor-pointer"
                          onClick={() => setShowLightbox(true)}
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted/60">
                          <CheckCircle2 className="size-10 text-emerald-500" />
                          <p className="text-xs text-muted-foreground px-4 text-center">{t('generation.videoReady', '视频已生成')}</p>
                        </div>
                      )}
                      <button
                        type="button"
                        className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-90 transition-opacity hover:opacity-100"
                        onClick={() => setShowLightbox(true)}
                        aria-label={t('generation.preview', '预览')}
                      >
                        <div className="flex size-14 items-center justify-center rounded-full bg-black/50 ring-2 ring-rose-500/40">
                          <Play className="size-7 translate-x-0.5 text-white" />
                        </div>
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="done-wait-url"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center gap-2 px-6 py-8"
                    >
                      <CheckCircle2 className="size-10 text-emerald-500 animate-pulse" />
                      <p className="text-xs text-muted-foreground">正在加载视频地址…</p>
                    </motion.div>
                  )
                ) : genState === 'error' ? (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-3 px-6 py-8 text-center"
                  >
                    <XCircle className="size-12 text-destructive/70" />
                    <p className="text-sm text-destructive/80">
                      {record?.error_message || t('generation.videoFailed', '生成失败，请重试')}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-3 px-6 py-8 text-center"
                  >
                    <div className="flex size-16 items-center justify-center rounded-2xl border border-rose-500/25 bg-rose-500/10">
                      <Clapperboard className="size-8 text-rose-500/50" />
                    </div>
                    <p className="text-sm text-muted-foreground/70">{t('generation.noVideoYet', '填写提示词后点击「生成」')}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 操作栏 */}
            <div className="p-3 space-y-2 border-t border-border">
              {genState === 'done' && videoSrc && (
                <Button
                  type="button"
                  variant="secondary"
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
                className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-muted-foreground transition-app hover:border-rose-500/30 hover:text-foreground"
              >
                <div className="flex items-center gap-2">
                  <Library className="size-4 text-rose-500" />
                  {t('chat.viewDetail', '查看详情')}
                </div>
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* 视频灯箱 */}
      {showLightbox && videoSrc && (
        <MediaPreview
          url={videoSrc}
          type="video"
          alt={config.prompt}
          coverUrl={record?.thumbnail_path ?? undefined}
          onClose={() => setShowLightbox(false)}
        />
      )}
    </PageContainer>
  )
}
