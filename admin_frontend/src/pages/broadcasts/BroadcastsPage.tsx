import * as React from 'react'
import {
  CheckCircle2,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  EmptyState,
  PageContainer,
  PageHeader,
  SectionCard,
} from '@/components/shared'
import {
  ButtonGroup,
  DetailDrawer,
  ProForm,
  ProFormField,
} from '@/components/admin'
import { cn } from '@/lib/utils'
import { ApiBusinessError } from '@/lib/api/schema'
import {
  createBroadcast,
  fetchBroadcasts,
  revokeBroadcast,
  searchUsersForPicker,
  type BroadcastFromApi,
  type BroadcastTargetKind,
  type UserPickerItem,
} from '@/lib/api/broadcasts'

type DraftState = {
  title: string
  message: string
  linkUrl: string
  targetKind: BroadcastTargetKind
  selectedUsers: UserPickerItem[]
}

function emptyDraft(): DraftState {
  return { title: '', message: '', linkUrl: '', targetKind: 'all', selectedUsers: [] }
}

function UserPicker({
  selected,
  onChange,
}: {
  selected: UserPickerItem[]
  onChange: (next: UserPickerItem[]) => void
}) {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<UserPickerItem[]>([])
  const [searching, setSearching] = React.useState(false)
  const debounceRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true)
      try {
        const data = await searchUsersForPicker(query.trim())
        setResults(data)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [query])

  const toggle = (user: UserPickerItem) => {
    const exists = selected.find((u) => u.id === user.id)
    if (exists) onChange(selected.filter((u) => u.id !== user.id))
    else onChange([...selected, user])
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-muted/30 p-2">
          {selected.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1.5 rounded-md bg-card px-2 py-1 text-xs shadow-xs"
            >
              <span className="max-w-[180px] truncate">{u.nickname?.trim() || u.email}</span>
              <button
                type="button"
                onClick={() => onChange(selected.filter((s) => s.id !== u.id))}
                className="cursor-pointer text-muted-foreground hover:text-destructive"
              >
                <X className="size-3" strokeWidth={2.25} />
              </button>
            </span>
          ))}
          <span className="ml-auto self-center text-[11px] text-muted-foreground">
            已选 {selected.length} 人
          </span>
        </div>
      )}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={2.25}
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="按邮箱或昵称搜索用户…"
          className="pl-8"
        />
      </div>
      {(searching || results.length > 0) && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
          {searching ? (
            <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
              <Loader2 className="mr-2 size-3.5 animate-spin" strokeWidth={2.25} />
              搜索中…
            </div>
          ) : results.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">无匹配用户</div>
          ) : (
            results.map((u) => {
              const isSelected = !!selected.find((s) => s.id === u.id)
              return (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => toggle(u)}
                  className={cn(
                    'flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm transition',
                    isSelected ? 'bg-primary/5' : 'hover:bg-muted/50',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{u.nickname?.trim() || u.email}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
                  </div>
                  {isSelected && <CheckCircle2 className="size-4 text-primary" strokeWidth={2.25} />}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default function BroadcastsPage() {
  const [items, setItems] = React.useState<BroadcastFromApi[]>([])
  const [loading, setLoading] = React.useState(true)
  const [total, setTotal] = React.useState(0)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<DraftState>(emptyDraft())
  const [saving, setSaving] = React.useState(false)

  const [revokingId, setRevokingId] = React.useState<string | null>(null)
  const [revoking, setRevoking] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchBroadcasts({ page: 1, page_size: 50 })
      setItems(data?.items ?? [])
      setTotal(data?.total ?? 0)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('加载推送列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const handleOpenCreate = () => {
    setDraft(emptyDraft())
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!draft.title.trim()) return toast.error('请填写标题')
    if (draft.targetKind === 'users' && draft.selectedUsers.length === 0) {
      return toast.error('请选择至少 1 个用户')
    }
    setSaving(true)
    try {
      const created = await createBroadcast({
        title: draft.title.trim(),
        message: draft.message.trim() || null,
        link_url: draft.linkUrl.trim() || null,
        target_kind: draft.targetKind,
        target_user_ids:
          draft.targetKind === 'users' ? draft.selectedUsers.map((u) => u.id) : undefined,
      })
      // 用接口返回值直接插入列表头
      setItems((prev) => [created, ...prev])
      setTotal((t) => t + 1)
      toast.success('已发送')
      setDialogOpen(false)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('发送失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRevoke = async () => {
    if (!revokingId) return
    setRevoking(true)
    try {
      const updated = await revokeBroadcast(revokingId)
      setItems((prev) => prev.map((b) => (b.id === revokingId ? updated : b)))
      toast.success('已撤回')
      setRevokingId(null)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('撤回失败')
    } finally {
      setRevoking(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="消息推送"
        description="给 C 端用户推送站内通知（铃铛面板内可见）。支持全员或选定用户，发送后可撤回"
        icon={Megaphone}
        iconAccent="warning"
        breadcrumbs={[{ label: '平台运营' }, { label: '消息推送' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
              ) : (
                <RefreshCw className="size-3.5" strokeWidth={2.25} />
              )}
              刷新
            </Button>
            <Button size="sm" onClick={handleOpenCreate}>
              <Plus className="size-3.5" strokeWidth={2.25} />
              新建推送
            </Button>
          </>
        }
      />

      {loading ? (
        <SectionCard>
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" strokeWidth={2.25} />
            加载中…
          </div>
        </SectionCard>
      ) : items.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Megaphone}
            title="暂无推送记录"
            description="点击右上角「新建推送」开始"
            action={
              <Button onClick={handleOpenCreate}>
                <Plus className="size-4" strokeWidth={2.25} />
                新建推送
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">共 {total} 条</p>
          {items.map((row) => {
            const revoked = !!row.revokedAt
            const readPct = row.totalCount > 0 ? Math.round((row.readCount / row.totalCount) * 100) : 0
            return (
              <div
                key={row.id}
                className={cn(
                  'card-hover rounded-xl border border-border bg-card p-4 transition',
                  revoked && 'opacity-60',
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold leading-tight text-foreground">
                        {row.title}
                      </h3>
                      {revoked ? (
                        <Badge variant="secondary">已撤回</Badge>
                      ) : (
                        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
                          已发送
                        </Badge>
                      )}
                      <Badge variant="outline" className="gap-1">
                        <Users className="size-3" strokeWidth={2.25} />
                        {row.targetKind === 'all' ? '全部用户' : '选定用户'}
                      </Badge>
                    </div>
                    {row.message && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{row.message}</p>
                    )}
                    {row.linkUrl && (
                      <p className="truncate text-xs text-muted-foreground">
                        跳转：<span className="font-mono">{row.linkUrl}</span>
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-muted-foreground">
                      <span>
                        送达 <span className="font-semibold text-foreground">{row.totalCount}</span> 人
                      </span>
                      <span>
                        已读{' '}
                        <span className="font-semibold text-foreground">{row.readCount}</span> ({readPct}%)
                      </span>
                      {row.operatorName && <span>操作人：{row.operatorName}</span>}
                      {row.createdAt && (
                        <span>
                          {new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false })}
                        </span>
                      )}
                    </div>
                  </div>
                  {!revoked && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setRevokingId(row.id)}
                    >
                      <Trash2 className="size-3.5" strokeWidth={2.25} />
                      撤回
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 新建推送 Drawer */}
      <DetailDrawer
        open={dialogOpen}
        onOpenChange={(o) => !saving && setDialogOpen(o)}
        title="新建推送"
        description="将向选定用户推送一条站内通知。C 端 60 秒内可在铃铛面板看到"
        width="lg"
        padded={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              立即发送
            </Button>
          </div>
        }
      >
        <ProForm layout="1-col" className="p-5">
          <ProFormField label="标题" required>
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="例：新版本上线公告"
              maxLength={255}
            />
          </ProFormField>
          <ProFormField label="正文">
            <Textarea
              value={draft.message}
              onChange={(e) => setDraft({ ...draft, message: e.target.value })}
              placeholder="多行文字，简明扼要…"
              rows={5}
            />
          </ProFormField>
          <ProFormField label="跳转链接" hint="选填，如 /dashboard 或外链 URL">
            <Input
              value={draft.linkUrl}
              onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })}
              placeholder="/dashboard 或 https://promo.example.com"
            />
          </ProFormField>
          <ProFormField label="推送对象" required>
            <ButtonGroup
              fullWidth
              value={draft.targetKind}
              onChange={(v) => setDraft({ ...draft, targetKind: v })}
              options={[
                { value: 'all', label: '全部用户' },
                { value: 'users', label: '选定用户' },
              ]}
            />
          </ProFormField>
          {draft.targetKind === 'users' && (
            <ProFormField label="选择用户">
              <UserPicker
                selected={draft.selectedUsers}
                onChange={(selectedUsers) => setDraft({ ...draft, selectedUsers })}
              />
            </ProFormField>
          )}
        </ProForm>
      </DetailDrawer>

      {/* 撤回确认 */}
      <AlertDialog
        open={!!revokingId}
        onOpenChange={(o) => !revoking && !o && setRevokingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>撤回这条推送？</AlertDialogTitle>
            <AlertDialogDescription>
              撤回后将从所有目标用户的通知列表中移除，已读用户也将不再看到。此操作无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleRevoke()
              }}
              disabled={revoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoking && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              确认撤回
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}
