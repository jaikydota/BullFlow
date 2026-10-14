import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowUp,
  Paperclip,
  UploadCloud,
  X,
  FileText,
  Image as ImageIcon,
  Building2,
  Building,
  UserCircle,
  Briefcase,
  Package,
  Bot,
  Zap,
  Volume2,
  Library,
  BookOpen,
} from 'lucide-react'
import { VoiceButton } from '@/components/chat/VoiceButton'
import { AbilityShortcuts } from '@/components/chat/AbilityShortcuts'
import { toast } from '@/components/common/Toast'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
} from '@/utils/constants'
import type { Ability, ChatMode } from '@/pages/chat/abilities'
import { MAX_REFS, type SelectedReference } from '@/pages/chat/composerUtils'
import { FastTypeSelector } from '@/components/chat/FastTypeSelector'
import { FastParamsPanel } from '@/components/chat/FastParamsPanel'
import { FastParamsDropdown } from '@/components/chat/FastParamsDropdown'
import { SkillSelector } from '@/components/generation/SkillSelector'
import {
  FAST_TYPE_PLACEHOLDER,
  type FastParams,
  type FastType,
} from '@/pages/chat/fastConfig'

// ─── 文件类型校验 ─────────────────────────────────────────────
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi'])
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'opus'])
const DOC_EXTS = new Set(ALLOWED_DOCUMENT_EXTENSIONS.map((e) => e.replace('.', '')))

function validateDroppedFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXTS.has(ext) || ALLOWED_IMAGE_TYPES.includes(file.type)) return null
  if (VIDEO_EXTS.has(ext) || ALLOWED_VIDEO_TYPES.includes(file.type)) return null
  if (AUDIO_EXTS.has(ext)) return null
  if (DOC_EXTS.has(ext)) return null
  return `不支持的文件格式 .${ext}，仅支持文档、图片、视频或音频文件`
}

const MIN_LINES = 3
const MAX_LINES = 8
const LINE_HEIGHT_PX = 22

export type ChatComposerVariant = 'hero' | 'inline'

export type ChatComposerHandle = {
  focus: () => void
  setText: (t: string) => void
}

export type ChatComposerProps = {
  variant?: ChatComposerVariant
  /** 模式 */
  mode: ChatMode
  onModeChange: (m: ChatMode) => void
  /** 知识库 / 朗读开关 */
  useKnowledge: boolean
  onUseKnowledgeChange: (v: boolean) => void
  autoRead: boolean
  onAutoReadChange: (v: boolean) => void
  /** 能力快捷标签（仅 hero 显示在 textarea 上方） */
  abilities: Ability[]
  selectedAbility: string | null
  onAbilitySelect: (a: Ability | null) => void
  /** 已选参考素材 */
  selectedRefs: SelectedReference[]
  onOpenRefDialog: (initialTab?: 'document' | 'image' | 'brand' | 'product') => void
  onRemoveRef: (key: string) => void
  /** 上传文档参考：本地选文件 → 上传到资产管理 → 自动加入参考列表 */
  onUploadDocRef?: (file: File) => Promise<void>
  /** 上传图片参考：本地选文件 → 上传到资产管理 → 自动加入参考列表 */
  onUploadImageRef?: (file: File) => Promise<void>
  /** 快速模式：类型 + 参数（mode='fast' 时启用） */
  fastType?: FastType
  onFastTypeChange?: (t: FastType) => void
  fastParams?: FastParams
  onFastParamsChange?: (p: FastParams) => void
  /** 创作技巧（skill 池）选择 */
  skillId?: string | null
  onSkillChange?: (id: string | null) => void
  /** 发送 / 上传 */
  disabled?: boolean
  uploading?: boolean
  onSend: (text: string) => void
  onFileUpload?: (file: File) => Promise<void>
  onVoiceTranscribingChange?: (active: boolean) => void
  className?: string
}

function refIcon(kind: SelectedReference['kind']) {
  switch (kind) {
    case 'document': return FileText
    case 'image': return ImageIcon
    case 'brand': return Building2
    case 'product': return Package
    case 'company': return Building
    case 'customer': return UserCircle
    case 'case': return Briefcase
  }
}

function refLabel(r: SelectedReference): string {
  switch (r.kind) {
    case 'document': return r.title
    case 'image': return r.title || '图片'
    case 'brand': return r.name
    case 'product': return r.name
    case 'company': return r.name
    case 'customer': return r.name
    case 'case': return r.title
  }
}

function refKeyOf(r: SelectedReference): string {
  return `${r.kind}:${r.id}`
}

export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
  {
    variant = 'inline',
    mode,
    onModeChange,
    useKnowledge,
    onUseKnowledgeChange,
    autoRead,
    onAutoReadChange,
    abilities,
    selectedAbility,
    onAbilitySelect,
    selectedRefs,
    onOpenRefDialog,
    onRemoveRef,
    onUploadDocRef,
    onUploadImageRef,
    fastType = 'article',
    onFastTypeChange,
    fastParams,
    onFastParamsChange,
    skillId,
    onSkillChange,
    disabled,
    uploading,
    onSend,
    onFileUpload,
    onVoiceTranscribingChange,
    className,
  },
  ref,
) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [refUploading, setRefUploading] = useState<'doc' | 'image' | null>(null)
  const dragCounterRef = useRef(0)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const docRefInputRef = useRef<HTMLInputElement>(null)
  const imageRefInputRef = useRef<HTMLInputElement>(null)

  const handlePickDocRef = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许重复上传同一文件
    if (!file || !onUploadDocRef) return
    setRefUploading('doc')
    try {
      await onUploadDocRef(file)
    } finally {
      setRefUploading(null)
    }
  }, [onUploadDocRef])

  const handlePickImageRef = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onUploadImageRef) return
    setRefUploading('image')
    try {
      await onUploadImageRef(file)
    } finally {
      setRefUploading(null)
    }
  }, [onUploadImageRef])

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    setText: (t: string) => {
      setText(t)
      requestAnimationFrame(() => {
        const el = taRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      })
    },
  }))

  const resize = useCallback(() => {
    const el = taRef.current
    if (!el) return
    const minPx = LINE_HEIGHT_PX * MIN_LINES + 16
    const maxPx = LINE_HEIGHT_PX * MAX_LINES + 16
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minPx), maxPx)}px`
  }, [])
  useEffect(() => { resize() }, [text, resize])

  const send = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
  }, [disabled, onSend, text])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // ─── 拖拽 ──────────────────────────────────────────
  const onDragEnter = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current += 1
    if (dragCounterRef.current === 1) setIsDragOver(true)
  }
  const onDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation() }
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current === 0) setIsDragOver(false)
  }
  const onDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragOver(false)
    if (!onFileUpload) return
    const file = e.dataTransfer.files[0]
    if (!file) return
    const err = validateDroppedFile(file)
    if (err) { toast.error(err); return }
    await onFileUpload(file)
  }, [onFileUpload])

  const canSend = Boolean(text.trim()) && !disabled && !uploading
  const isDisabled = disabled || uploading
  const isFast = mode === 'fast'
  const hideKbAutoRead = isFast

  // 容器：与页面对齐，全宽（max-w 与水平 padding 交由父级控制）
  const containerCls = 'w-full'

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn('w-full', className)}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div
          className={cn(
            'relative flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-card transition-all sm:p-4',
            'focus-within:border-primary/40 focus-within:shadow-[0_8px_28px_oklch(var(--primary)/0.10)]',
            isDisabled && 'opacity-70',
            isDragOver && 'border-primary/60 bg-primary/5 ring-2 ring-primary/30',
            !isDragOver && 'border-border',
            containerCls,
          )}
        >
          {/* 拖拽遮罩 */}
          {isDragOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-primary/5">
              <UploadCloud className="size-8 text-primary animate-bounce" />
              <span className="text-sm font-medium text-primary">释放以上传文件</span>
            </div>
          )}

          {/* hero variant：能力 chips 顶部（仅 Agent 模式展示） */}
          {variant === 'hero' && !isFast && abilities.length > 0 && (
            <AbilityShortcuts
              abilities={abilities}
              selected={selectedAbility}
              onSelect={(a) => onAbilitySelect(selectedAbility === a.id ? null : a)}
            />
          )}

          {/* 快速模式：模板 chips 横排 + 文章 brand_info（位于 textarea 上方） */}
          {isFast && fastParams && onFastParamsChange && (
            <FastParamsPanel
              type={fastType}
              params={fastParams}
              onChange={onFastParamsChange}
              onTemplateSelect={(_label, value) => setText(value)}
              disabled={isDisabled}
            />
          )}

          {/* 选中参考素材 chip 行 */}
          {selectedRefs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedRefs.map((r) => {
                const Icon = refIcon(r.kind)
                return (
                  <span
                    key={refKeyOf(r)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs text-foreground"
                  >
                    <Icon className="size-3 text-muted-foreground" strokeWidth={2.25} aria-hidden />
                    <span className="max-w-[12rem] truncate">{refLabel(r)}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveRef(refKeyOf(r))}
                      className="-mr-1 inline-flex size-4 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="移除"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )
              })}
              <span className="inline-flex items-center rounded-full px-2 text-[11px] text-muted-foreground">
                {selectedRefs.length}/{MAX_REFS}
              </span>
            </div>
          )}

          {/* 输入主体：参考按钮（拉伸同高）+ textarea */}
          <div className="flex items-stretch gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onOpenRefDialog()}
                  disabled={isDisabled}
                  className={cn(
                    'flex w-14 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 self-stretch rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors',
                    'hover:border-primary/40 hover:bg-primary/5 hover:text-primary',
                    isDisabled && 'cursor-not-allowed opacity-50',
                  )}
                  aria-label="挂载参考素材"
                >
                  <Library className="size-5" strokeWidth={2.25} aria-hidden />
                  <span className="text-[10px] font-semibold leading-none">
                    {selectedRefs.length}/{MAX_REFS}
                  </span>
                  <span className="text-[10px] leading-none opacity-70">参考</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">挂载参考素材（文档 / 图片 / 品牌 / 产品）</TooltipContent>
            </Tooltip>

            <textarea
              ref={taRef}
              rows={MIN_LINES}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={isDisabled}
              placeholder={
                uploading
                  ? '文件上传中...'
                  : isDragOver
                    ? ''
                    : isFast
                      ? FAST_TYPE_PLACEHOLDER[fastType]
                      : variant === 'hero'
                        ? '今天想创作什么？描述需求、目标或主题，或先挂载素材...'
                        : (t('chat.messagePlaceholder') ?? '输入消息...')
              }
              className={cn(
                'flex-1 resize-none rounded-xl bg-muted/30 px-3 py-3 text-[15px] leading-relaxed text-foreground',
                'placeholder:text-muted-foreground/70 focus:bg-muted/50 focus:outline-none disabled:cursor-not-allowed',
                'transition-colors',
                isDragOver && 'opacity-0',
              )}
              style={{
                minHeight: `${LINE_HEIGHT_PX * MIN_LINES + 16}px`,
                maxHeight: `${LINE_HEIGHT_PX * MAX_LINES + 16}px`,
              }}
            />
          </div>

          {/* 工具栏 */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2.5">
            {/* 左侧 */}
            <div className="flex flex-wrap items-center gap-2">
              {/* 模式分段控件 */}
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => onModeChange('agent')}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    mode === 'agent'
                      ? 'bg-card text-primary shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Bot className="size-3.5" strokeWidth={2.25} aria-hidden />
                  Agent
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange('fast')}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    mode === 'fast'
                      ? 'bg-card text-primary shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Zap className="size-3.5" strokeWidth={2.25} aria-hidden />
                  快速模式
                </button>
              </div>

              {/* 文档 / 图片 快捷上传入口 —— 上传到资产管理并自动加入参考列表 */}
              <input
                ref={docRefInputRef}
                type="file"
                accept={ALLOWED_DOCUMENT_EXTENSIONS.join(',')}
                className="hidden"
                onChange={handlePickDocRef}
              />
              <input
                ref={imageRefInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePickImageRef}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => docRefInputRef.current?.click()}
                    disabled={isDisabled || refUploading !== null || !onUploadDocRef}
                    className={cn(
                      'inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary',
                      (isDisabled || refUploading !== null) && 'cursor-not-allowed opacity-50',
                    )}
                    aria-label="上传文档参考"
                  >
                    {refUploading === 'doc' ? (
                      <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
                    ) : (
                      <FileText className="size-4" strokeWidth={2.1} />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">上传文档参考（自动入资产管理）</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => imageRefInputRef.current?.click()}
                    disabled={isDisabled || refUploading !== null || !onUploadImageRef}
                    className={cn(
                      'inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary',
                      (isDisabled || refUploading !== null) && 'cursor-not-allowed opacity-50',
                    )}
                    aria-label="上传图片参考"
                  >
                    {refUploading === 'image' ? (
                      <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
                    ) : (
                      <ImageIcon className="size-4" strokeWidth={2.1} />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">上传图片参考（自动入资产管理）</TooltipContent>
              </Tooltip>

              {/* 快速模式：类型选择器 + 模型/参数下拉，紧跟"添加图片参考"右侧 */}
              {isFast && onFastTypeChange && (
                <FastTypeSelector value={fastType} onChange={onFastTypeChange} />
              )}
              {isFast && fastParams && onFastParamsChange && (
                <FastParamsDropdown
                  type={fastType}
                  params={fastParams}
                  onChange={onFastParamsChange}
                  disabled={isDisabled}
                />
              )}

              {/* 创作技巧（skill 池）：agent 用 chat 类、fast 用对应生成类 */}
              {onSkillChange && (
                <SkillSelector
                  compact
                  value={skillId}
                  onChange={onSkillChange}
                  contentType={isFast ? fastType : 'chat'}
                  disabled={isDisabled}
                />
              )}

              {/* KB 开关 */}
              {!hideKbAutoRead && (
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <Switch
                    checked={useKnowledge}
                    onCheckedChange={onUseKnowledgeChange}
                    className="h-[18px] w-8 data-[state=checked]:bg-primary"
                  />
                  <BookOpen className="size-3.5" strokeWidth={2.1} aria-hidden />
                  <span>知识库</span>
                </label>
              )}

              {/* TTS 自动朗读开关 */}
              {!hideKbAutoRead && (
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <Switch
                    checked={autoRead}
                    onCheckedChange={onAutoReadChange}
                    className="h-[18px] w-8 data-[state=checked]:bg-primary"
                  />
                  <Volume2 className="size-3.5" strokeWidth={2.1} aria-hidden />
                  <span>朗读</span>
                </label>
              )}

            </div>

            {/* 右侧：语音 + 发送 */}
            <div className="flex items-center gap-2">
              {uploading && (
                <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Paperclip className="size-3.5 animate-pulse" strokeWidth={2.1} />
                  上传中
                </div>
              )}
              <VoiceButton
                disabled={isDisabled}
                onSend={onSend}
                onTranscribingChange={onVoiceTranscribingChange}
                onError={(msg) => toast.error(msg)}
              />
              <Button
                type="button"
                size="icon"
                onClick={send}
                disabled={!canSend}
                className={cn(
                  'size-10 rounded-xl',
                  canSend
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md'
                    : 'bg-muted text-muted-foreground hover:bg-muted',
                )}
                aria-label={
                  isFast
                    ? fastType === 'article' ? '生成文章' : fastType === 'image' ? '生成图片' : '生成视频'
                    : t('chat.sendMessage')
                }
              >
                <ArrowUp className="size-5" strokeWidth={2.25} />
              </Button>
            </div>
          </div>
        </div>

        {variant === 'inline' && onFileUpload && (
          <div className="mt-2 text-center text-[11px] text-muted-foreground">
            AI 可能会出错，请核查重要信息。可拖拽文档 / 图片 / 视频 / 音频到此处上传。
          </div>
        )}
      </div>
    </TooltipProvider>
  )
})
