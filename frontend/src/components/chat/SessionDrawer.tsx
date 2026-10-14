import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { formatDistanceToNow, isToday, isYesterday } from 'date-fns'
import { parseApiDate } from '@/utils/format'
import { History, MessageSquare, Plus, Search, Trash2 } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState, IconBox } from '@/components/shared'
import { useChatStore } from '@/stores/chatStore'
import type { ChatSession } from '@/types/chat'
import { cn } from '@/lib/utils'

export type SessionDrawerProps = {
  open: boolean
  onClose: () => void
}

type SessionGroup = {
  key: 'today' | 'yesterday' | 'week' | 'earlier'
  label: string
  items: ChatSession[]
}

function groupSessions(sessions: ChatSession[]): SessionGroup[] {
  const groups: Record<SessionGroup['key'], ChatSession[]> = {
    today: [],
    yesterday: [],
    week: [],
    earlier: [],
  }
  const now = Date.now()
  const sevenDays = 7 * 24 * 60 * 60 * 1000

  for (const s of sessions) {
    const d = parseApiDate(s.updated_at)
    if (isToday(d)) groups.today.push(s)
    else if (isYesterday(d)) groups.yesterday.push(s)
    else if (now - d.getTime() < sevenDays) groups.week.push(s)
    else groups.earlier.push(s)
  }

  const labels: Record<SessionGroup['key'], string> = {
    today: '今天',
    yesterday: '昨天',
    week: '近 7 天',
    earlier: '更早',
  }

  return (Object.keys(groups) as SessionGroup['key'][])
    .filter((k) => groups[k].length > 0)
    .map((k) => ({ key: k, label: labels[k], items: groups[k] }))
}

export function SessionDrawer({ open, onClose }: SessionDrawerProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { sessionId } = useParams<{ sessionId?: string }>()
  const sessions = useChatStore((s) => s.sessions)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const loadSessions = useChatStore((s) => s.loadSessions)

  const [q, setQ] = useState('')
  const [pendingDelete, setPendingDelete] = useState<ChatSession | null>(null)

  const qs = searchParams.toString()
  const chatPath = useCallback(
    (sid?: string) => {
      if (!sid) return qs ? `/chat?${qs}` : '/chat'
      return qs ? `/chat/${sid}?${qs}` : `/chat/${sid}`
    },
    [qs],
  )

  useEffect(() => {
    if (open) void loadSessions()
  }, [open, loadSessions])

  /* 切到不同会话时自动关闭 */
  const lastSidRef = useRef(sessionId)
  useEffect(() => {
    if (open && lastSidRef.current !== sessionId) {
      onClose()
    }
    lastSidRef.current = sessionId
  }, [sessionId, open, onClose])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle
      ? sessions.filter((s) => (s.title ?? '').toLowerCase().includes(needle))
      : sessions
  }, [q, sessions])

  const grouped = useMemo(() => groupSessions(filtered), [filtered])

  const handleSelect = useCallback(
    (sid: string) => {
      navigate(chatPath(sid))
    },
    [navigate, chatPath],
  )

  const handleNew = useCallback(() => {
    navigate(chatPath())
    onClose()
  }, [navigate, chatPath, onClose])

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    await deleteSession(id)
    setPendingDelete(null)
    if (sessionId === id) navigate(chatPath())
  }, [deleteSession, navigate, pendingDelete, sessionId, chatPath])

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="right"
          className="flex w-[min(100vw-2rem,22rem)] max-w-none flex-col gap-0 overflow-hidden border-l border-border bg-card p-0 [&>button[data-slot=sheet-close]]:top-5 [&>button[data-slot=sheet-close]]:right-5 [&>button[data-slot=sheet-close]]:opacity-60 [&>button[data-slot=sheet-close]]:hover:opacity-100"
        >
          {/* 头部 */}
          <div className="relative shrink-0 overflow-hidden border-b border-border/70 px-5 pb-4 pt-5">
            <div
              className="blob-primary pointer-events-none absolute -top-16 -right-12 size-44 opacity-50"
              aria-hidden
            />
            <div className="relative z-10 flex items-center gap-3 pr-8">
              <IconBox icon={History} accent="primary" size="md" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-tight text-foreground">
                  历史会话
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {sessions.length > 0 ? `共 ${sessions.length} 个对话` : '暂无会话'}
                </div>
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              className="relative z-10 mt-4 w-full cursor-pointer gap-1.5"
              onClick={handleNew}
            >
              <Plus className="size-3.5" strokeWidth={2.25} />
              新建对话
            </Button>

            <div className="relative z-10 mt-3">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索会话标题..."
                className="h-9 pl-8 text-xs"
              />
            </div>
          </div>

          {/* 列表（按时间分组） */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
            {grouped.length === 0 ? (
              <div className="px-2 pt-8">
                <EmptyState
                  icon={MessageSquare}
                  title={q.trim() ? '没有匹配的会话' : '暂无会话'}
                  description={q.trim() ? '试试别的关键词' : '点击上方"新建对话"开始你的创作'}
                />
              </div>
            ) : (
              <div className="space-y-4">
                {grouped.map((g) => (
                  <div key={g.key} className="space-y-1">
                    <div className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                      {g.label}
                      <span className="ml-1.5 text-muted-foreground/60">· {g.items.length}</span>
                    </div>
                    <ul className="space-y-0.5">
                      {g.items.map((s) => (
                        <li key={s.id}>
                          <SessionRow
                            session={s}
                            active={s.id === sessionId}
                            onSelect={() => handleSelect(s.id)}
                            onDelete={() => setPendingDelete(s)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="删除会话"
        message={`确定删除会话「${pendingDelete?.title ?? ''}」？此操作无法撤销。`}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
      />
    </>
  )
}

function SessionRow({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: ChatSession
  active: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const subtitle = formatDistanceToNow(parseApiDate(session.updated_at), { addSuffix: true })
  const model = session.model_name?.trim()

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors',
        active
          ? 'border-primary/30 bg-primary/8'
          : 'border-transparent hover:border-border hover:bg-muted/60',
      )}
    >
      {active && (
        <span className="absolute -left-1 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
      )}
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 text-left"
      >
        <span
          className={cn(
            'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors',
            active
              ? 'bg-primary/15 text-primary'
              : 'bg-muted text-muted-foreground group-hover:bg-card group-hover:text-foreground',
          )}
        >
          <MessageSquare className="size-3.5" strokeWidth={2.25} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-[13px] font-medium',
              active ? 'text-primary' : 'text-foreground',
            )}
          >
            {session.title?.trim() || '未命名会话'}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="truncate">{subtitle}</span>
            {model && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <Badge
                  variant="outline"
                  className="h-3.5 shrink-0 border-border/60 bg-muted/40 px-1 text-[9px] font-normal text-muted-foreground"
                >
                  {model}
                </Badge>
              </>
            )}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
        aria-label="删除"
      >
        <Trash2 className="size-3.5" strokeWidth={2.25} />
      </button>
    </div>
  )
}
