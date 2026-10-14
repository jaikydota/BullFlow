import * as React from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import {
  BadgeDollarSign,
  Ban,
  Check,
  Copy,
  Link2,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Users2,
  Wallet,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { PageContainer, PageHeader, StatCard } from '@/components/shared'
import {
  BarChart,
  ChartCard,
  DataTable,
  DetailDrawer,
  FilterBar,
  LineChart,
  ProForm,
  ProFormField,
  SearchInput,
} from '@/components/admin'
import { ApiBusinessError } from '@/lib/api/schema'
import {
  deleteSalesApi,
  fetchSalesCandidates,
  fetchSalesList,
  fetchSalesOverview,
  fetchSalesReferrals,
  promoteSalesApi,
  referralUrl,
  updateSalesApi,
  type SalesCandidate,
  type SalesOverview,
  type SalesReferral,
  type SalesRow,
} from '@/lib/api/sales'

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label}已复制`),
    () => toast.error('复制失败，请手动复制'),
  )
}

export default function SalesPage() {
  const [overview, setOverview] = React.useState<SalesOverview | null>(null)
  const [rows, setRows] = React.useState<SalesRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')

  // 添加销售（仅「从已有普通用户提升」）
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [candSearch, setCandSearch] = React.useState('')
  const [cands, setCands] = React.useState<SalesCandidate[]>([])
  const [candLoading, setCandLoading] = React.useState(false)
  const [selectedCand, setSelectedCand] = React.useState<SalesCandidate | null>(null)
  const [promoteCode, setPromoteCode] = React.useState('')

  // 停用 / 启用
  const [togglingId, setTogglingId] = React.useState<string | null>(null)

  const [deleting, setDeleting] = React.useState<SalesRow | null>(null)
  const [delBusy, setDelBusy] = React.useState(false)

  const [refSales, setRefSales] = React.useState<SalesRow | null>(null)
  const [refs, setRefs] = React.useState<SalesReferral[]>([])
  const [refLoading, setRefLoading] = React.useState(false)

  const load = React.useCallback(async (q?: string) => {
    setLoading(true)
    try {
      const [ov, list] = await Promise.all([fetchSalesOverview(), fetchSalesList(q)])
      setOverview(ov)
      setRows(list)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('销售数据加载失败')
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
      setCands(await fetchSalesCandidates(q))
    } catch {
      setCands([])
    } finally {
      setCandLoading(false)
    }
  }, [])

  const openCreate = () => {
    setCandSearch('')
    setSelectedCand(null)
    setPromoteCode('')
    setCands([])
    setDrawerOpen(true)
    void loadCands()
  }

  // 从已有普通用户提升为销售
  const handlePromote = async () => {
    if (!selectedCand) return toast.error('请选择要设为销售的用户')
    setSaving(true)
    try {
      const saved = await promoteSalesApi({
        user_id: selectedCand.id,
        invitation_code: promoteCode.trim() || null,
      })
      setRows((prev) => [saved, ...prev])
      toast.success(`已将「${saved.nickname}」设为销售，邀请码 ${saved.invitationCode}`)
      setDrawerOpen(false)
      void fetchSalesOverview().then(setOverview).catch(() => {})
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('设为销售失败')
    } finally {
      setSaving(false)
    }
  }

  // 停用 / 启用（停用后该销售的邀请码失效、不可登录后台）
  const handleToggleStatus = async (r: SalesRow) => {
    const next = r.status === 'active' ? 'disabled' : 'active'
    setTogglingId(r.id)
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: next } : x)))
    try {
      await updateSalesApi(r.id, { status: next })
      toast.success(next === 'disabled' ? `已停用「${r.nickname}」` : `已启用「${r.nickname}」`)
    } catch (e) {
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: r.status } : x)))
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('操作失败')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    setDelBusy(true)
    try {
      await deleteSalesApi(deleting.id)
      setRows((prev) => prev.filter((r) => r.id !== deleting.id))
      toast.success(`已移除「${deleting.nickname}」的销售身份`)
      setDeleting(null)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('移除失败')
    } finally {
      setDelBusy(false)
    }
  }

  const openReferrals = async (r: SalesRow) => {
    setRefSales(r)
    setRefs([])
    setRefLoading(true)
    try {
      const res = await fetchSalesReferrals(r.id, 1, 50)
      setRefs(res.items ?? [])
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('引流记录加载失败')
    } finally {
      setRefLoading(false)
    }
  }

  const columns = React.useMemo<ColumnDef<SalesRow, unknown>[]>(
    () => [
      {
        header: '销售',
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
        header: '邀请码 / 引流链接',
        accessorKey: 'invitationCode',
        size: 220,
        cell: ({ row }) => {
          const code = row.original.invitationCode ?? ''
          return (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-medium text-foreground">{code || '—'}</span>
              {code && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    title="复制邀请码"
                    onClick={(e) => {
                      e.stopPropagation()
                      copy(code, '邀请码')
                    }}
                  >
                    <Copy className="size-3.5" strokeWidth={2.25} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    title="复制引流链接"
                    onClick={(e) => {
                      e.stopPropagation()
                      copy(referralUrl(code), '引流链接')
                    }}
                  >
                    <Link2 className="size-3.5" strokeWidth={2.25} />
                  </Button>
                </>
              )}
            </div>
          )
        },
      },
      {
        header: '引流数',
        accessorKey: 'referredCount',
        size: 90,
        cell: ({ row }) => (
          <span className="font-medium text-foreground">{row.original.referredCount}</span>
        ),
      },
      {
        header: '付费数',
        accessorKey: 'paidCount',
        size: 90,
        cell: ({ row }) => <span className="text-foreground">{row.original.paidCount}</span>,
      },
      {
        header: '贡献营收',
        accessorKey: 'revenueYuan',
        size: 110,
        cell: ({ row }) => (
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            ¥{row.original.revenueYuan.toLocaleString()}
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
              启用
            </Badge>
          ) : (
            <Badge variant="outline">已停用</Badge>
          ),
      },
      {
        id: 'actions',
        header: '操作',
        size: 220,
        cell: ({ row }) => {
          const r = row.original
          const busy = togglingId === r.id
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  void openReferrals(r)
                }}
              >
                <Users2 className="size-3.5" strokeWidth={2.25} />
                引流记录
              </Button>
              {r.status === 'active' ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleToggleStatus(r)
                  }}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
                  ) : (
                    <Ban className="size-3.5" strokeWidth={2.25} />
                  )}
                  停用
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  className="border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleToggleStatus(r)
                  }}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
                  ) : (
                    <Power className="size-3.5" strokeWidth={2.25} />
                  )}
                  启用
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                className="size-8 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                title="删除"
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleting(r)
                }}
              >
                <Trash2 className="size-3.5" strokeWidth={2.25} />
              </Button>
            </div>
          )
        },
      },
    ],
    [togglingId],
  )

  const sm = overview?.summary

  return (
    <PageContainer>
      <PageHeader
        title="销售管理"
        description="从已有普通用户中提升为引流销售，分配专属邀请码与引流链接，统计引流与营收归因"
        icon={BadgeDollarSign}
        iconAccent="primary"
        breadcrumbs={[{ label: '用户与权限' }, { label: '销售管理' }]}
        actions={
          <>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="size-3.5" strokeWidth={2.25} />
              添加销售
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

      {/* 概览卡片 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="销售员" value={sm?.salesTotal ?? 0} icon={BadgeDollarSign} iconAccent="primary" />
        <StatCard title="累计引流用户" value={sm?.referredTotal ?? 0} icon={Users2} iconAccent="info" />
        <StatCard title="付费引流用户" value={sm?.paidTotal ?? 0} icon={TrendingUp} iconAccent="success" />
        <StatCard
          title="引流贡献营收"
          value={`¥${(sm?.revenueYuan ?? 0).toLocaleString()}`}
          icon={Wallet}
          iconAccent="warning"
        />
      </div>

      {/* 图表 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Top 引流销售"
          description="按引流用户数排名"
          icon={BadgeDollarSign}
          loading={loading}
          isEmpty={!overview?.topSales.length}
        >
          <BarChart
            data={overview?.topSales ?? []}
            xKey="name"
            series={[{ dataKey: 'count', label: '引流人数', color: 'primary' }]}
          />
        </ChartCard>
        <ChartCard
          title="近 30 天引流注册趋势"
          description="带邀请码注册的用户数"
          icon={TrendingUp}
          loading={loading}
          isEmpty={!overview?.trend.length}
        >
          <LineChart
            data={overview?.trend ?? []}
            xKey="date"
            series={[{ dataKey: 'count', label: '引流注册', color: 'primary' }]}
          />
        </ChartCard>
      </div>

      <div className="mt-4">
        <FilterBar
          search={
            <SearchInput
              value={search}
              onChange={setSearch}
              onDebouncedChange={(v) => load(v.trim() || undefined)}
              onSubmit={(v) => load(v.trim() || undefined)}
              placeholder="搜索姓名 / 邀请码 / 邮箱…"
            />
          }
        />
        <div className="mt-3">
          <DataTable columns={columns} data={rows} loading={loading} rowKey={(r) => r.id} />
        </div>
      </div>

      {/* 添加销售 Drawer（仅从已有普通用户提升） */}
      <DetailDrawer
        open={drawerOpen}
        onOpenChange={(o) => !saving && setDrawerOpen(o)}
        title="添加销售"
        description="从已有普通用户中选择一个提升为销售；其可继续用原账号登录用户端，并获得专属引流邀请码"
        width="md"
        padded={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handlePromote} disabled={saving || !selectedCand}>
              {saving && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              设为销售
            </Button>
          </div>
        }
      >
        <ProForm layout="1-col" className="p-5">
          <ProFormField label="选择用户" required hint="仅普通用户可设为销售；销售的其它资料请在「用户管理」修改">
            <SearchInput
              value={candSearch}
              onChange={setCandSearch}
              onDebouncedChange={(v) => loadCands(v.trim() || undefined)}
              placeholder="搜索昵称 / 手机 / 邮箱…"
            />
          </ProFormField>
          <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-border p-1.5">
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
          <ProFormField label="固定邀请码" hint="留空自动生成（大写字母数字）">
            <Input
              value={promoteCode}
              onChange={(e) => setPromoteCode(e.target.value.toUpperCase())}
              placeholder="留空自动生成"
              className="font-mono"
            />
          </ProFormField>
        </ProForm>
      </DetailDrawer>

      {/* 引流记录 Drawer */}
      <DetailDrawer
        open={!!refSales}
        onOpenChange={(o) => !o && setRefSales(null)}
        title={`引流记录 · ${refSales?.nickname ?? ''}`}
        description={refSales ? `邀请码 ${refSales.invitationCode} · 共 ${refSales.referredCount} 人` : undefined}
        width="lg"
      >
        {refLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" strokeWidth={2.25} />
            加载中…
          </div>
        ) : refs.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">暂无引流用户</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">用户</th>
                  <th className="px-2 py-2 font-medium">手机尾号</th>
                  <th className="px-2 py-2 font-medium">当前套餐</th>
                  <th className="px-2 py-2 font-medium">付费</th>
                  <th className="px-2 py-2 font-medium">注册时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {refs.map((u) => (
                  <tr key={u.id}>
                    <td className="px-2 py-2 text-foreground">{u.nickname || '—'}</td>
                    <td className="px-2 py-2 font-mono text-xs text-muted-foreground">
                      {u.phoneTail ? `****${u.phoneTail}` : '—'}
                    </td>
                    <td className="px-2 py-2">{u.planSlug ?? '—'}</td>
                    <td className="px-2 py-2">
                      {u.paid ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
                          已付费
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {u.createdAt?.replace('T', ' ').slice(0, 16) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DetailDrawer>

      {/* 删除确认 */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !delBusy && !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-destructive" strokeWidth={2.25} />
              移除销售身份「{deleting?.nickname}」？
            </AlertDialogTitle>
            <AlertDialogDescription>
              将该用户降级回普通用户、其引流邀请码失效；**账号本身与数据完整保留**，已引流用户的历史归因保留。如需重新设为销售可再次「添加销售」。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              disabled={delBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {delBusy && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              确认移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}
