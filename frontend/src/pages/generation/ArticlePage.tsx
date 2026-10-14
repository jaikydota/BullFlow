import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, Maximize2, PenLine, Wand2 } from 'lucide-react'
import { Button } from '@/components/common/Button'
import { DocumentPreviewModal } from '@/components/common/DocumentPreview'
import { GenerationConfigPanel } from '@/components/generation/GenerationConfigPanel'
import { defaultGenConfig, type GenerationConfig } from '@/components/generation/genConfig'
import { toast } from '@/components/common/Toast'
import { generationApi } from '@/api/generation'
import MarkDown2 from '@/components/markdown2/index'
import { PageContainer, PageHeader } from '@/components/shared'
import { trackEvent, EVENTS } from '@/utils/tracking'

function parseModel(combined: string): { provider: string; model: string } {
  const [provider, ...rest] = (combined || '').split('|')
  return { provider: provider ?? '', model: rest.join('|') }
}

export default function ArticlePage() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<GenerationConfig>(() => defaultGenConfig('article'))
  const [content, setContent] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [articleBlobUrl, setArticleBlobUrl] = useState<string | null>(null)
  // 文章生成统一走异步：提交后拿到 taskId 轮询记录（普通文章 & 图文混编同一套）。
  // 任务在后台独立完成，用户切菜单 / 关闭页面都不影响入库，可在「内容库」查看。
  const [taskId, setTaskId] = useState<string | null>(null)
  const [taskMixed, setTaskMixed] = useState(false)  // 当前任务是否图文混编（控制提示文案）
  const busy = taskId !== null

  // 全屏预览：把 markdown 正文转 blob URL，交给内容库同款 DocumentPreviewModal 渲染（无多余进度条）
  const openPreview = useCallback(() => {
    if (!content) return
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
    setArticleBlobUrl(url)
    setPreviewOpen(true)
  }, [content])

  const closePreview = useCallback(() => {
    setPreviewOpen(false)
    setArticleBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  useEffect(() => {
    if (taskId === null) return
    const id = taskId
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null
    async function tick() {
      try {
        const g = await generationApi.get(id)
        if (cancelled) return
        if (g.status === 'completed') {
          setContent(g.content || '')
          setTaskId(null)
          trackEvent(EVENTS.GENERATION_SUCCESS, { type: 'article' })
          toast.success(t('generation.articleDone', '文章生成完成'))
          if (timer) clearInterval(timer)
        } else if (g.status === 'failed') {
          setTaskId(null)
          trackEvent(EVENTS.GENERATION_FAILED, { type: 'article', error: g.error_message })
          toast.error(g.error_message || t('generation.streamError', '生成失败'))
          if (timer) clearInterval(timer)
        }
      } catch { /* 静默重试 */ }
    }
    void tick()
    timer = setInterval(tick, 3000)
    return () => { cancelled = true; if (timer) clearInterval(timer) }
  }, [taskId, t])

  const handleGenerate = useCallback(async () => {
    if (!config.prompt.trim()) {
      toast.error(t('generation.promptRequired', '请输入提示词'))
      return
    }
    const { provider, model } = parseModel(config.modelKey || '')
    setContent('')

    const payload = {
      prompt: config.prompt.trim(),
      reference: config.reference,
      skill_id: config.skillId,
      provider: provider || undefined,
      model: model || undefined,
      template_label: config.templateLabel || undefined,
    }
    try {
      const res = config.mixed
        ? await generationApi.generateArticleMixed(payload)
        : await generationApi.generateArticle(payload)
      setTaskMixed(!!config.mixed)
      setTaskId(res.id)
      trackEvent(EVENTS.CREATE_PROJECT, { type: 'article' })
      trackEvent(EVENTS.GENERATION_START, { type: 'article', mixed: !!config.mixed })
      toast.success(
        config.mixed
          ? t('generation.mixedSubmitted', '图文混编生成中，正在配图…')
          : t('generation.articleSubmitted', '文章生成中，可切换页面，稍后在内容库查看…'),
      )
    } catch (e) {
      toast.error((e as Error).message || t('generation.streamError', '提交失败'))
    }
  }, [config, t])

  return (
    <PageContainer size="xl">
      <PageHeader
        title={t('menu.article', '文章生成')}
        description={t('generation.articleSubtitle', '提交后台生成文章长文，可切换页面，完成后在内容库查看；可勾选「图文混编」让 AI 自动配图，支持创作大师风格与参考内容。')}
        icon={PenLine}
        iconAccent="article"
        breadcrumbs={[{ label: '创作分发' }, { label: '内容创作' }, { label: t('menu.article', '文章生成') }]}
      />

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        {/* 左侧配置面板 */}
        <section className="card-elevated p-5">
          <div className="flex flex-col gap-5">
            <GenerationConfigPanel contentType="article" value={config} onChange={setConfig} disabled={busy} />

            <Button
              type="button"
              variant="primary"
              size="lg"
              className={
                config.prompt.trim() && !busy
                  ? 'w-full bg-blue-500 text-white hover:bg-blue-600'
                  : 'w-full bg-muted text-muted-foreground hover:bg-muted'
              }
              disabled={!config.prompt.trim() || busy}
              loading={busy}
              onClick={handleGenerate}
            >
              <Wand2 className="size-4" aria-hidden />
              {busy ? t('generation.generating', '生成中…') : t('generation.generate', '生成')}
            </Button>
          </div>
        </section>

        {/* 右侧预览面板 */}
        <section className="relative flex min-h-[480px] flex-col gradient-border shadow-card lg:min-h-[640px]">
          <div className="relative z-10 flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
              <Eye className="size-4 text-blue-500" />
              {t('generation.preview', '预览')}
              {busy && (
                <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/25 bg-blue-500/10 px-1.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                  <span className="animate-pulse">●</span>
                  {taskMixed ? t('generation.mixedWorking', '正在生成图文…') : t('generation.articleWorking', '正在生成文章…')}
                </span>
              )}
            </div>
            {content && (
              <button
                type="button"
                onClick={openPreview}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-app hover:border-blue-500/30 hover:text-foreground"
              >
                <Maximize2 className="size-3" />
                {t('generation.fullscreen', '全屏')}
              </button>
            )}
          </div>
          <div className="relative z-10 flex-1 overflow-y-auto p-5">
            {!content && busy ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <div className="relative flex size-14 items-center justify-center">
                  <div className="absolute inset-0 animate-spin rounded-full border-2 border-blue-500/20 border-t-blue-500" />
                  <PenLine className="size-6 text-blue-500/60" />
                </div>
                <p className="text-sm text-muted-foreground/80">
                  {taskMixed ? t('generation.mixedWorking', '正在生成图文…') : t('generation.articleWorking', '正在生成文章…')}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  {taskMixed ? t('generation.mixedWorkingHint', '正文撰写 + 自动配图') : t('generation.articleWorkingHint', '可切换页面，完成后在「内容库」查看')}
                </p>
              </div>
            ) : !content && !busy ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground/70">
                {t('generation.emptyPreview', '生成的文章将在此显示。')}
              </div>
            ) : (
              <MarkDown2 content={content} loading={busy && !content} autoScroll className="text-sm" />
            )}
          </div>
        </section>
      </div>

      {/* 全屏预览：复用内容库的 DocumentPreviewModal（Markdown 渲染，无多余进度条） */}
      {previewOpen && articleBlobUrl && (
        <DocumentPreviewModal
          url={articleBlobUrl}
          fileName="article.md"
          fileType="md"
          title={config.prompt.slice(0, 60) || t('generation.preview', '预览')}
          onClose={closePreview}
        />
      )}
    </PageContainer>
  )
}
