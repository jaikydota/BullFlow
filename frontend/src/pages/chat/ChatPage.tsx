import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useChatStore } from '@/stores/chatStore'
import type { ChatMessage } from '@/types/chat'
import { chatApi } from '@/api/chat'
import { documentsApi } from '@/api/documents'
import { imagesApi } from '@/api/images'
import { API_BASE } from '@/utils/constants'
import { generateId } from '@/utils/helpers'
import { useAuth } from '@/hooks/useAuth'
import { useSSE } from '@/hooks/useSSE'
import { ArrowLeft, History, Plus, Wand2 } from 'lucide-react'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { ChatComposer, type ChatComposerHandle } from '@/components/chat/ChatComposer'
import { SessionDrawer } from '@/components/chat/SessionDrawer'
import { QuickToolGrid } from '@/components/chat/QuickToolGrid'
import { InspirationBoard } from '@/components/chat/InspirationBoard'
import { GradientHero, IconBox, PageContainer } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/common/Toast'
import { ReferenceDialog } from '@/components/chat/ReferenceDialog'
import { quickTools } from '@/pages/chat/quickTools'
import {
  getAbilitiesForMode,
  type Ability,
  type ChatMode,
} from '@/pages/chat/abilities'
import {
  buildMessageText,
  toReferencePayload,
  toReferenceConfig,
  toDisplayRefs,
  MAX_REFS,
  refKey,
  type SelectedReference,
} from '@/pages/chat/composerUtils'
import {
  DEFAULT_FAST_PARAMS,
  type FastParams,
  type FastType,
} from '@/pages/chat/fastConfig'
import { generationApi } from '@/api/generation'
import api from '@/api/index'
import { ROUTES } from '@/utils/constants'

function buildAssistantMessage(
  data: unknown,
  fallback: {
    sessionId: string
    userId: string
    content: string
    generationResults?: import('@/types/chat').GenerationResult[]
    exportResults?: import('@/types/chat').ExportResult[]
  },
): ChatMessage {
  // 后端 done 里常带 role=assistant 但 content 为空（流式时全文已在 SSE 里推过）；
  // 不能整对象直接 return，否则丢掉 store 里已拼好的 streamContent
  if (data && typeof data === 'object' && 'role' in data && (data as ChatMessage).role === 'assistant') {
    const msg = data as ChatMessage
    const useStream = !msg.content?.trim() && Boolean(fallback.content?.trim())
    return {
      ...msg,
      content: useStream ? fallback.content : (msg.content ?? fallback.content),
      generation_results: (fallback.generationResults && fallback.generationResults.length > 0)
        ? fallback.generationResults
        : (msg.generation_results ?? null),
      export_results: (fallback.exportResults && fallback.exportResults.length > 0)
        ? fallback.exportResults
        : (msg.export_results ?? null),
      upload_results: msg.upload_results ?? null,
    }
  }
  const partial = data && typeof data === 'object' ? (data as Partial<ChatMessage>) : {}
  return {
    id: partial.id ?? generateId(),
    session_id: partial.session_id ?? fallback.sessionId,
    user_id: partial.user_id ?? fallback.userId,
    role: 'assistant',
    content: partial.content ?? fallback.content,
    content_type: partial.content_type ?? 'text',
    attachments: partial.attachments ?? null,
    token_count: partial.token_count ?? null,
    context_chunks: partial.context_chunks ?? null,
    tts_audio_url: partial.tts_audio_url ?? null,
    generation_results: (fallback.generationResults && fallback.generationResults.length > 0)
      ? fallback.generationResults
      : (partial.generation_results ?? null),
    export_results: (fallback.exportResults && fallback.exportResults.length > 0)
      ? fallback.exportResults
      : (partial.export_results ?? null),
    upload_results: partial.upload_results ?? null,
    created_at: partial.created_at ?? new Date().toISOString(),
  }
}

export default function ChatPage() {
  const { t } = useTranslation()
  const { sessionId } = useParams<{ sessionId?: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { start, stop } = useSSE()

  const sessions = useChatStore((s) => s.sessions)
  const messages = useChatStore((s) => s.messages)
  const loadSessions = useChatStore((s) => s.loadSessions)
  const loadMessages = useChatStore((s) => s.loadMessages)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const createSession = useChatStore((s) => s.createSession)
  const addMessage = useChatStore((s) => s.addMessage)
  const setStreaming = useChatStore((s) => s.setStreaming)
  const appendStreamChunk = useChatStore((s) => s.appendStreamChunk)
  const finishStream = useChatStore((s) => s.finishStream)
  const updateMessageTtsUrl = useChatStore((s) => s.updateMessageTtsUrl)
  const cancelStream = useChatStore((s) => s.cancelStream)
  const appendGenerationResult = useChatStore((s) => s.appendGenerationResult)
  const appendExportResult = useChatStore((s) => s.appendExportResult)
  const streaming = useChatStore((s) => s.streaming)

  const [mode, setMode] = useState<ChatMode>('agent')
  const [useKnowledge, setUseKnowledge] = useState(true)
  const [autoRead, setAutoRead] = useState(false)
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false)
  const [voiceTranscribing, setVoiceTranscribing] = useState(false)
  const [autoPlayMsgId, setAutoPlayMsgId] = useState<string | null>(null)
  const [fileUploading, setFileUploading] = useState(false)

  // 参考素材 / 能力
  const [refDialogOpen, setRefDialogOpen] = useState(false)
  const [refDialogInitTab, setRefDialogInitTab] = useState<'document' | 'image' | 'brand' | 'product'>('document')
  const [selectedRefs, setSelectedRefs] = useState<SelectedReference[]>([])
  const [skillId, setSkillId] = useState<string | null>(null)
  const [selectedAbility, setSelectedAbility] = useState<Ability | null>(null)
  const composerRef = useRef<ChatComposerHandle>(null)

  // 快速模式：类型 + 参数（不走对话流，直接调 generation API）
  const [fastType, setFastType] = useState<FastType>('article')
  const [fastParams, setFastParams] = useState<FastParams>(DEFAULT_FAST_PARAMS)

  const uid = user?.id ?? ''

  useEffect(() => { void loadSessions() }, [loadSessions])

  // 切换会话时（流式中跳过）
  const streamingRef = useRef(false)
  streamingRef.current = streaming
  useEffect(() => {
    if (!sessionId) {
      clearMessages()
      return
    }
    if (streamingRef.current) return
    void loadMessages(sessionId)
  }, [sessionId, loadMessages, clearMessages])

  const prevSessionRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (prevSessionRef.current !== undefined && prevSessionRef.current !== sessionId) {
      stop()
      cancelStream()
    }
    prevSessionRef.current = sessionId
  }, [sessionId, stop, cancelStream])

  useEffect(() => () => stop(), [stop])

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === sessionId),
    [sessions, sessionId],
  )

  const title = currentSession?.title?.trim() || t('chat.noSession')

  const navigateToChatSession = useCallback(
    (sid: string) => {
      const qs = searchParams.toString()
      navigate(qs ? `/chat/${sid}?${qs}` : `/chat/${sid}`)
    },
    [navigate, searchParams],
  )

  // 模式切换：fast 模式强制关闭 KB / autoRead
  const handleModeChange = useCallback((m: ChatMode) => {
    setMode(m)
    if (m === 'fast') {
      setUseKnowledge(false)
      setAutoRead(false)
      // 切到快速模式且类型是图片/视频时，清掉不支持的文档挂载
      if (fastType !== 'article') {
        setSelectedRefs((prev) => prev.filter((r) => r.kind !== 'document'))
      }
    } else {
      setUseKnowledge(true)
    }
  }, [fastType])

  /** 快速模式：根据 fastType 直接调 generation API；不进对话流 */
  const handleFastSubmit = useCallback(
    async (rawPrompt: string) => {
      if (!uid) {
        toast.error(t('auth.login'))
        return
      }
      const prompt = rawPrompt.trim()
      if (!prompt) return

      // 挂载的图片用作参考图（image_url）；其余维度（公司/品牌/产品/客户/案例/文档）
      // 推导为 reference 配置：挂了就 custom、什么都没挂就 none（不参考）
      const imgRef = selectedRefs.find((r): r is Extract<SelectedReference, { kind: 'image' }> => r.kind === 'image')
      const reference = toReferenceConfig(selectedRefs)

      try {
        let recordId: string | undefined

        if (fastType === 'article') {
          // 文章 stream:false 同步返回 {id, content, ...}；可能耗时数十秒
          toast.success('正在生成文章，请稍候…')
          const resp = await api.post('/generation/article', {
            prompt,
            reference,
            skill_id: skillId,
            template_label: fastParams.article.template_label || undefined,
            stream: false,
          }) as { id?: string }
          recordId = resp?.id
        } else if (fastType === 'image') {
          const resp = await generationApi.generateImage({
            prompt,
            provider: fastParams.image.provider,
            size: fastParams.image.size,
            image_url: imgRef?.url || fastParams.image.image_url || undefined,
            reference,
            skill_id: skillId,
          })
          recordId = (resp as { id?: string })?.id
        } else {
          const resp = await generationApi.generateVideo({
            prompt,
            provider: fastParams.video.provider,
            resolution: fastParams.video.resolution,
            duration: fastParams.video.duration,
            enable_audio: fastParams.video.enable_audio,
            image_url: imgRef?.url || fastParams.video.image_url || undefined,
            reference,
            skill_id: skillId,
          })
          recordId = (resp as { id?: string })?.id
        }

        setSelectedRefs([])
        setSelectedAbility(null)

        if (recordId) {
          toast.success(fastType === 'article' ? '文章已生成' : '已提交，正在生成中')
          navigate(`/generation/library/${recordId}`)
        } else {
          // 兜底：没拿到 id 时跳回列表页
          toast.success('已提交，可在内容库查看')
          navigate(ROUTES.GENERATION_LIBRARY)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '提交失败'
        toast.error(msg)
      }
    },
    [uid, t, fastType, fastParams, selectedRefs, skillId, navigate],
  )

  const handleSend = useCallback(
    async (rawText: string) => {
      if (!uid) {
        toast.error(t('auth.login'))
        return
      }

      // 快速模式：派发到 generation API
      if (mode === 'fast') {
        await handleFastSubmit(rawText)
        return
      }

      // 正文只含用户输入（+ 能力/快速前缀）；参考素材走结构化 references 字段
      const text = buildMessageText(rawText, selectedAbility, mode)
      const references = toReferencePayload(selectedRefs)
      const displayRefs = toDisplayRefs(selectedRefs)

      let sid = sessionId ?? useChatStore.getState().currentSessionId
      if (!sid) {
        sid = await createSession({
          title: rawText.slice(0, 80) || t('chat.newChat'),
        })
        navigateToChatSession(sid)
      }

      const userMsg: ChatMessage = {
        id: generateId(),
        session_id: sid,
        user_id: uid,
        role: 'user',
        content: text,
        content_type: 'text',
        attachments: displayRefs.length ? displayRefs : null,
        token_count: null,
        context_chunks: null,
        tts_audio_url: null,
        generation_results: null,
        export_results: null,
        upload_results: null,
        created_at: new Date().toISOString(),
      }
      addMessage(userMsg)
      setStreaming(true)

      // 发送后清空一次性的素材 / 能力
      setSelectedRefs([])
      setSelectedAbility(null)

      const url = `${API_BASE}/chat/completions`

      await start(
        url,
        {
          session_id: sid,
          message: text,
          stream: true,
          use_knowledge: useKnowledge,
          references: references.length ? references : undefined,
          skill_id: skillId,
        },
        {
          onContent: (chunk) => { appendStreamChunk(chunk) },
          onGeneration: (data) => {
            if (data && typeof data === 'object') {
              appendGenerationResult(data as import('@/types/chat').GenerationResult)
            }
          },
          onExportResult: (data) => {
            if (data && typeof data === 'object') {
              appendExportResult(data as import('@/types/chat').ExportResult)
            }
          },
          onDone: (data) => {
            const storeState = useChatStore.getState()
            const streamText = storeState.streamContent
            const generationResults = storeState.streamGenerationResults
            const exportResults = storeState.streamExportResults
            const assistant = buildAssistantMessage(data, {
              sessionId: sid!,
              userId: uid,
              content: streamText,
              generationResults: generationResults.length > 0 ? generationResults : undefined,
              exportResults: exportResults.length > 0 ? exportResults : undefined,
            })
            finishStream(assistant)
            void loadSessions()
            if (autoRead && assistant.id) {
              setAutoPlayMsgId(assistant.id)
              chatApi.generateTts(assistant.id)
                .then((res) => {
                  if (res?.tts_audio_url) updateMessageTtsUrl(assistant.id, res.tts_audio_url)
                })
                .catch(() => { /* 静默 */ })
            }
          },
          onError: () => {
            cancelStream()
            toast.error(t('chat.streamError'))
          },
        },
      )
    },
    [
      uid, sessionId, addMessage, setStreaming,
      start, appendStreamChunk, appendGenerationResult,
      appendExportResult, finishStream, updateMessageTtsUrl,
      cancelStream, createSession, navigateToChatSession, loadSessions,
      t, useKnowledge, autoRead, selectedRefs, selectedAbility, mode, skillId,
      handleFastSubmit,
    ],
  )

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!uid) {
        toast.error(t('auth.login'))
        return
      }
      let sid = sessionId ?? useChatStore.getState().currentSessionId
      if (!sid) {
        sid = await createSession({
          title: `上传：${file.name.slice(0, 60)}`,
        })
        navigateToChatSession(sid)
      }
      setFileUploading(true)
      try {
        const msg = await chatApi.uploadChatFile(sid, file)
        addMessage(msg)
        void loadSessions()
      } catch {
        toast.error('文件上传失败，请检查格式或稍后重试')
      } finally {
        setFileUploading(false)
      }
    },
    [uid, sessionId, createSession, navigateToChatSession, addMessage, loadSessions, t],
  )

  /** 把灵感板 / 快捷工具的 prompt 预填到 Composer 并聚焦 */
  const handleFillPrompt = useCallback((prompt: string) => {
    composerRef.current?.setText(prompt)
    // 滚动到 composer
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }, [])

  const handleAbilitySelect = useCallback((a: Ability | null) => {
    setSelectedAbility(a)
    if (a) composerRef.current?.setText(a.prompt)
  }, [])

  const handleRemoveRef = useCallback((k: string) => {
    setSelectedRefs((prev) => prev.filter((r) => refKey(r) !== k))
  }, [])

  const handleRefConfirm = useCallback((refs: SelectedReference[]) => {
    setSelectedRefs(refs)
  }, [])

  // 切换快速模式类型：图片/视频不支持文档参考，移除已挂载的文档，避免残留
  const handleFastTypeChange = useCallback((next: FastType) => {
    setFastType(next)
    if (next !== 'article') {
      setSelectedRefs((prev) => prev.filter((r) => r.kind !== 'document'))
    }
  }, [])

  const handleOpenRefDialog = useCallback((tab?: 'document' | 'image' | 'brand' | 'product') => {
    if (tab) setRefDialogInitTab(tab)
    setRefDialogOpen(true)
  }, [])

  // 上传文档参考：调用 /documents/upload，落资产管理 + 自动加入参考列表
  const handleUploadDocRef = useCallback(async (file: File) => {
    if (selectedRefs.length >= MAX_REFS) {
      toast.error(`参考素材最多 ${MAX_REFS} 个`)
      return
    }
    try {
      const doc = await documentsApi.upload(file, { title: file.name })
      const ref: SelectedReference = {
        kind: 'document',
        id: String((doc as { id?: string | number }).id ?? ''),
        title: String((doc as { title?: string }).title ?? file.name),
      }
      setSelectedRefs((prev) => [...prev, ref])
      toast.success('文档已上传到资产管理，已加入参考')
    } catch (e) {
      console.error(e)
      toast.error('文档上传失败')
    }
  }, [selectedRefs.length])

  // 上传图片参考：调用 /images/upload，落资产管理 + 自动加入参考列表
  const handleUploadImageRef = useCallback(async (file: File) => {
    if (selectedRefs.length >= MAX_REFS) {
      toast.error(`参考素材最多 ${MAX_REFS} 个`)
      return
    }
    try {
      const img = (await imagesApi.upload(file)) as unknown as {
        id?: string | number
        title?: string | null
        file_path?: string | null
      }
      const ref: SelectedReference = {
        kind: 'image',
        id: String(img.id ?? ''),
        url: img.file_path ?? '',
        title: img.title ?? file.name,
      }
      setSelectedRefs((prev) => [...prev, ref])
      toast.success('图片已上传到资产管理，已加入参考')
    } catch (e) {
      console.error(e)
      toast.error('图片上传失败')
    }
  }, [selectedRefs.length])

  const handleNewChat = useCallback(() => {
    const qs = searchParams.toString()
    navigate(qs ? `/chat?${qs}` : '/chat')
  }, [navigate, searchParams])

  const abilities = useMemo(() => getAbilitiesForMode(mode), [mode])
  const isEmpty = messages.length === 0 && !streaming && !voiceTranscribing

  /** 历史会话 / 新对话工具行 */
  const actionRow = (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="cursor-pointer gap-1.5"
        onClick={() => setSessionDrawerOpen(true)}
      >
        <History className="size-3.5" strokeWidth={2.1} />
        历史会话
      </Button>
      {(sessionId || !isEmpty) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="cursor-pointer gap-1.5"
          onClick={handleNewChat}
        >
          <Plus className="size-3.5" strokeWidth={2.25} />
          新建对话
        </Button>
      )}
    </div>
  )

  return (
    <>
      {isEmpty && !sessionId ? (
        // 空态：Hero + Composer(hero) + QuickTools + Inspiration —— 页面级滚动
        // Chat 页特例：全宽会让对话/网格内容过分稀疏，统一收窄到 6xl 居中
        <PageContainer className="mx-auto max-w-6xl space-y-6">
          <GradientHero
            tone="primary"
            eyebrow={<span>AI 创作中心</span>}
            title="你的 AI · 连接创意与增长"
            description="挂载知识库 / 媒体 / 品牌 / 产品，让 AI 基于你的资产创作 — 写文章、做海报、拆爆款、一键分发。"
            actions={actionRow}
          />

          <ChatComposer
            ref={composerRef}
            variant="hero"
            mode={mode}
            onModeChange={handleModeChange}
            useKnowledge={useKnowledge}
            onUseKnowledgeChange={setUseKnowledge}
            autoRead={autoRead}
            onAutoReadChange={setAutoRead}
            abilities={abilities}
            selectedAbility={selectedAbility?.id ?? null}
            onAbilitySelect={handleAbilitySelect}
            selectedRefs={selectedRefs}
            onOpenRefDialog={handleOpenRefDialog}
            onRemoveRef={handleRemoveRef}
            onUploadDocRef={handleUploadDocRef}
            onUploadImageRef={handleUploadImageRef}
            fastType={fastType}
            onFastTypeChange={handleFastTypeChange}
            fastParams={fastParams}
            onFastParamsChange={setFastParams}
            skillId={skillId}
            onSkillChange={setSkillId}
            disabled={streaming}
            uploading={fileUploading}
            onSend={handleSend}
            onFileUpload={handleFileUpload}
            onVoiceTranscribingChange={setVoiceTranscribing}
            className="px-0"
          />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">快捷工具</h2>
            <QuickToolGrid tools={quickTools} onPromptFill={handleFillPrompt} />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">今日灵感</h2>
            <InspirationBoard onApply={handleFillPrompt} />
          </section>
        </PageContainer>
      ) : (
        // 对话视图：h-full 自适应 main 可视区（自动跟随公告栏开/关）；ChatWindow 内部独立滚动；Composer 贴底；外层 overflow-hidden 杜绝外滚
        <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3 overflow-hidden pb-3">
          {/* 顶部 toolbar：返回 + IconBox + 标题（truncate） + 操作（永远在右） */}
          <div className="flex shrink-0 items-center justify-between gap-3 pb-1">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={handleNewChat}
                aria-label="返回创作中心"
              >
                <ArrowLeft className="size-4" strokeWidth={2.25} />
              </Button>
              <IconBox icon={Wand2} accent="primary" size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold tracking-tight text-foreground">
                  {title}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {mode === 'fast' ? '快速模式 · 单次精炼回答' : 'Agent 模式 · 支持知识库 / 媒体 / 工具调用'}
                </div>
              </div>
            </div>
            <div className="shrink-0">{actionRow}</div>
          </div>

          {/* ChatWindow：占满剩余高度，内部独立滚动 */}
          <ChatWindow
            className="min-h-0 flex-1 rounded-2xl border border-border"
            voiceTranscribing={voiceTranscribing}
            autoPlayMsgId={autoPlayMsgId}
          />

          {/* ChatComposer 贴底固定，全宽 */}
          <ChatComposer
            ref={composerRef}
            variant="inline"
            mode={mode}
            onModeChange={handleModeChange}
            useKnowledge={useKnowledge}
            onUseKnowledgeChange={setUseKnowledge}
            autoRead={autoRead}
            onAutoReadChange={setAutoRead}
            abilities={[]}
            selectedAbility={null}
            onAbilitySelect={handleAbilitySelect}
            selectedRefs={selectedRefs}
            onOpenRefDialog={handleOpenRefDialog}
            onRemoveRef={handleRemoveRef}
            onUploadDocRef={handleUploadDocRef}
            onUploadImageRef={handleUploadImageRef}
            fastType={fastType}
            onFastTypeChange={handleFastTypeChange}
            fastParams={fastParams}
            onFastParamsChange={setFastParams}
            skillId={skillId}
            onSkillChange={setSkillId}
            disabled={streaming}
            uploading={fileUploading}
            onSend={handleSend}
            onFileUpload={handleFileUpload}
            onVoiceTranscribingChange={setVoiceTranscribing}
            className="shrink-0"
          />
        </div>
      )}

      <SessionDrawer open={sessionDrawerOpen} onClose={() => setSessionDrawerOpen(false)} />

      <ReferenceDialog
        open={refDialogOpen}
        onClose={() => setRefDialogOpen(false)}
        selected={selectedRefs}
        onConfirm={handleRefConfirm}
        initialTab={refDialogInitTab}
        hideTabs={mode === 'fast' && fastType !== 'article' ? ['document'] : undefined}
      />
    </>
  )
}
