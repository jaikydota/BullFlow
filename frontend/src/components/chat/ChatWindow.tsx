import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, MessageSquare } from 'lucide-react'
import { useChatStore } from '@/stores/chatStore'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { cn } from '@/utils/helpers'

export type ChatWindowProps = {
  className?: string
  /** 语音识别进行中（显示"识别中"占位气泡） */
  voiceTranscribing?: boolean
  /** 自动朗读时需要自动播放的消息 ID */
  autoPlayMsgId?: string | null
}

export function ChatWindow({ className, voiceTranscribing = false, autoPlayMsgId }: ChatWindowProps) {
  const { t } = useTranslation()
  const messages = useChatStore((s) => s.messages)
  const streaming = useChatStore((s) => s.streaming)
  const streamContent = useChatStore((s) => s.streamContent)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)

  // 检测用户是否主动向上滚动（若滚到底附近则恢复自动跟随）
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      userScrolledUpRef.current = distFromBottom > 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // 新消息加入时（用户发送 / AI 回复完成）滚动到底
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages])

  // 流式开始时（streaming bubble 出现）强制滚动到底，忽略 userScrolledUp
  const prevStreamingRef = useRef(false)
  useEffect(() => {
    const justStarted = streaming && !prevStreamingRef.current
    prevStreamingRef.current = streaming
    if (justStarted) {
      userScrolledUpRef.current = false  // 重置：新一轮对话强制跟随
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [streaming])

  // 流式输出每个 token 时跟随滚动（instant 避免动画堆叠卡顿）
  useEffect(() => {
    if (streaming && !userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' })
    }
  }, [streamContent, streaming])

  const showStreamBubble = streaming
  const empty = messages.length === 0 && !showStreamBubble && !voiceTranscribing

  // 语音识别气泡出现时也滚动到底
  useEffect(() => {
    if (voiceTranscribing) {
      userScrolledUpRef.current = false
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [voiceTranscribing])

  return (
    <div
      ref={scrollRef}
      className={cn(
        'min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-smooth bg-gradient-to-b from-background/20 to-muted/30/35',
        className,
      )}
    >
      {empty ? (
        <div className="flex h-full flex-col items-center justify-center p-8">
          <div className="relative mb-6 flex size-20 items-center justify-center rounded-full bg-primary/10 shadow-lg">
            <div className="absolute inset-0 rounded-full border border-primary/20 animate-pulse" />
            <MessageSquare className="size-8 text-primary" aria-hidden />
          </div>
          <h2 className="mb-2 text-xl font-bold text-foreground font-[family-name:var(--font-display)]">
            {t('chat.noMessages')}
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm text-center">
            在下方输入消息开始。
          </p>
        </div>
      ) : (
        <div className="mx-auto max-w-7xl pb-5 pt-3 md:px-3">
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              autoPlay={m.id === autoPlayMsgId}
            />
          ))}
          {/* 语音识别中：右侧占位气泡 */}
          {voiceTranscribing && (
            <div className="flex justify-end px-2 py-1 animate-fade-in">
              <div className="flex max-w-[75%] items-end gap-2">
                <div className="relative rounded-2xl rounded-br-sm bg-primary/15 border border-primary/20 px-4 py-3 shadow-lg">
                  <div className="flex items-center gap-2">
                    <Mic className="size-3.5 shrink-0 text-primary animate-pulse" aria-hidden />
                    <span className="text-sm text-primary/80">正在识别语音</span>
                    {/* 三点跳动动画 */}
                    <span className="flex items-end gap-0.5 pb-0.5">
                      <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                      <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                      <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showStreamBubble ? (
            <MessageBubble
              message={{
                id: '__stream__',
                session_id: '',
                user_id: '',
                role: 'assistant',
                content: '',
                content_type: 'text',
                attachments: null,
                token_count: null,
                context_chunks: null,
                tts_audio_url: null,
                generation_results: null,
                export_results: null,
                upload_results: null,
                created_at: new Date().toISOString(),
              }}
              isStreaming
              streamContent={streamContent}
              scrollContainerRef={scrollRef}
            />
          ) : null}
          <div ref={bottomRef} className="h-2 shrink-0" aria-hidden />
        </div>
      )}
    </div>
  )
}
