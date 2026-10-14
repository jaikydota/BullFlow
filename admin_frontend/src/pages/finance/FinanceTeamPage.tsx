import * as React from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Check, Landmark, Loader2, Plus, RefreshCw, TriangleAlert, UserMinus } from 'lucide-react'
import toast from 'react-hot-toast'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { PageContainer, PageHeader } from '@/components/shared'
import {
  DataTable,
  DetailDrawer,
  FilterBar,
  ProForm,
  ProFormField,
  SearchInput,
} from '@/components/admin'
import { ApiBusinessError } from '@/lib/api/schema'
import {
  fetchFinanceCandidates,
  fetchFinanceList,
  promoteFinanceApi,
  revokeFinanceApi,
  type FinanceCandidate,
  type FinanceRow,
} from '@/lib/api/finance'

export default function FinanceTeamPage() {
  const [rows, setRows] = React.useState<FinanceRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')

  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [candSearch, setCandSearch] = React.useState('')
  const [cands, setCands] = React.useState<FinanceCandidate[]>([])
  const [candLoading, setCandLoading] = React.useState(false)
  const [selectedCand, setSelectedCand] = React.useState<FinanceCandidate | null>(null)

  const [revoking, setRevoking] = React.useState<FinanceRow | null>(null)
  const [revokeBusy, setRevokeBusy] = React.useState(false)

  const load = React.useCallback(async (q?: string) => {
    setLoading(true)
    try {
      setRows(await fetchFinanceList(q))
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('财务数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const loadCands = React.useCallback(async (q?: string) => {
    setCandLoading(true)
    try {
      setCands(await fetchFinanceCandidates(q))
    } catch {
      setCands([])
    } finally {
      setCandLoading(false)
    }
  }, [])

  const openPromote = () => {
    setCandSearch('')
    setSelectedCand(null)
    setCands([])
    setDrawerOpen(true)
    void loadCands()
  }

  const save = async () => {
    if (!selectedCand) return toast.error('请选择要设为财务的用户')
    setSaving(true)
    try {
      const saved = await promoteFinanceApi({ user_id: selectedCand.id })
      setRows((prev) => [saved, ...prev])
      toast.success(`已将「${saved.nickname || '该用户'}」设为财务`)
      setDrawerOpen(false)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('设为财务失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRevoke = async () => {
    if (!revoking) return
    setRevokeBusy(true)
    try {
      await revokeFinanceApi(revoking.id)
      setRows((prev) => prev.filter((r) => r.id !== revoking.id))
      toast.success(`已撤销「${revoking.nickname || '该用户'}」的财务身份`)
      setRevoking(null)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('撤销失败')
    } finally {
      setRevokeBusy(false)
    }
  }

  const columns = React.useMemo<ColumnDef<FinanceRow, unknown>[]>(
    () => [
      {
        header: '财务',
        accessorKey: 'nickname',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {row.original.nickname || '—'}
            </p>
            {row.original.email && (
              <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
            )}
          </div>
        ),
      },
      {
        header: '邮箱',
        accessorKey: 'email',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.email || '—'}</span>
        ),
      },
      {
        header: '手机号',
        accessorKey: 'phone',
        size: 140,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.phone || '—'}
          </span>
        ),
      },
      {
        header: '状态',
        accessorKey: 'status',
        size: 90,
        cell: ({ row }) =>
          row.original.status === 'active' ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
              正常
            </Badge>
          ) : (
            <Badge variant="outline">已禁用</Badge>
          ),
      },
      {
        header: '创建时间',
        accessorKey: 'createdAt',
        size: 150,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.createdAt?.replace('T', ' ').slice(0, 16) ?? '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        size: 130,
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                setRevoking(row.original)
              }}
            >
              <UserMinus className="size-3.5" strokeWidth={2.25} />
              撤销财务
            </Button>
          </div>
        ),
      },
    ],
    [],
  )

  return (
    <PageContainer>
      <PageHeader
        title="财务管理"
        description="管理财务团队成员。财务可进行订单核销与查看财务报表；仅可从普通用户提升而来"
        icon={Landmark}
        iconAccent="primary"
        breadcrumbs={[{ label: '用户与权限' }, { label: '财务管理' }]}
        actions={
          <>
            <Button size="sm" onClick={openPromote} className="gap-1.5">
              <Plus className="size-3.5" strokeWidth={2.25} />
              从用户提升为财务
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(search.trim() || undefined)}
              disabled={loading}
              className="gap-1.5"
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
              ) : (
                <RefreshCw className="size-3.5" strokeWidth={2.25} />
              )}
              刷新
            </Button>
          </>
        }
      />

      <div className="mt-4">
        <FilterBar
          search={
            <SearchInput
              value={search}
              onChange={setSearch}
              onDebouncedChange={(v) => load(v.trim() || undefined)}
              onSubmit={(v) => load(v.trim() || undefined)}
              placeholder="搜索昵称 / 邮箱 / 手机…"
            />
          }
        />
        <div className="mt-3">
          <DataTable columns={columns} data={rows} loading={loading} rowKey={(r) => r.id} />
        </div>
      </div>

      {/* 提升为财务 Drawer */}
      <DetailDrawer
        open={drawerOpen}
        onOpenChange={(o) => !saving && setDrawerOpen(o)}
        title="从用户提升为财务"
        description="仅普通用户可设为财务；该用户可继续用原账号登录用户端"
        width="md"
        padded={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              设为财务
            </Button>
          </div>
        }
      >
        <ProForm layout="1-col" className="p-5">
          <ProFormField
            label="选择用户"
            required
            hint="仅普通用户可设为财务"
          >
            <SearchInput
              value={candSearch}
              onChange={setCandSearch}
              onDebouncedChange={(v) => loadCands(v.trim() || undefined)}
              placeholder="搜索昵称 / 手机 / 邮箱…"
            />
          </ProFormField>
          <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-border p-1.5">
            {candLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" strokeWidth={2.25} /> 加载中…
              </div>
            ) : cands.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">无匹配的普通用户</div>
            ) : (
              cands.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCand(c)}
                  className={
                    'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition ' +
                    (selectedCand?.id === c.id
                      ? 'border-primary bg-primary/[0.06] text-primary'
                      : 'border-border hover:bg-muted/40')
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {c.nickname || '未命名'}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.email || (c.phoneTail ? `****${c.phoneTail}` : c.id.slice(0, 8))}
                    </span>
                  </span>
                  {selectedCand?.id === c.id && (
                    <Check className="size-4 shrink-0" strokeWidth={2.5} />
                  )}
                </button>
              ))
            )}
          </div>
        </ProForm>
      </DetailDrawer>

      {/* 撤销确认 */}
      <AlertDialog open={!!revoking} onOpenChange={(o) => !revokeBusy && !o && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-destructive" strokeWidth={2.25} />
              撤销「{revoking?.nickname || '该用户'}」的财务身份？
            </AlertDialogTitle>
            <AlertDialogDescription>
              撤销后该账号降回普通用户，将失去订单核销与财务报表权限。其订阅 / 订单等数据保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleRevoke()
              }}
              disabled={revokeBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeBusy && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              确认撤销
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}
