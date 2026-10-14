import * as React from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import {
  CreditCard,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  PageContainer,
  PageHeader,
  SectionCard,
} from '@/components/shared'
import {
  ButtonGroup,
  DataTable,
  DetailDrawer,
  FilterBar,
  NumberInput,
  ProForm,
  ProFormField,
  SearchInput,
} from '@/components/admin'
import {
  createBillingModelApi,
  deleteBillingModelApi,
  fetchBillingConfig,
  listBillingModelsApi,
  updateBillingDistributionApi,
  updateBillingModelApi,
  type AdminAiModel,
  type AdminAiModelInput,
  type BillingMode,
  type BillingModelType,
  type PricingMatrix,
} from '@/lib/api/billing'
import { ApiBusinessError } from '@/lib/api/schema'

type ModelForm = AdminAiModelInput & { id?: string | null }

function emptyModel(): ModelForm {
  return {
    name: '',
    provider: '',
    type: 'text',
    billingMode: 'pay_as_you_go',
    unitPrice: 0,
    pricingMatrix: null,
    enabled: true,
  }
}

/** 图片/视频默认规格倍率模板（仅作为新建时的起点，key 需与生成时实际传入的尺寸/分辨率一致才会命中） */
function defaultMatrix(type: 'image' | 'video'): PricingMatrix {
  if (type === 'video') {
    return {
      by: 'resolution_duration',
      items: [
        { key: '720p', label: '720P', multiplier: 1 },
        { key: '1080p', label: '1080P', multiplier: 2.25 },
        { key: '2k', label: '2K', multiplier: 4 },
        { key: '4k', label: '4K', multiplier: 9 },
      ],
    }
  }
  return {
    by: 'size',
    items: [
      { key: '1024x1024', label: '1K (1024)', multiplier: 1 },
      { key: '1536x1536', label: '1.5K (1536)', multiplier: 2.25 },
      { key: '2048x2048', label: '2K (2048)', multiplier: 4 },
      { key: '4096x4096', label: '4K (4096)', multiplier: 16 },
    ],
  }
}

export default function BillingPage() {
  const [activeTab, setActiveTab] = React.useState<'models' | 'distribution'>('models')

  // 模型列表
  const [models, setModels] = React.useState<AdminAiModel[]>([])
  const [modelsLoading, setModelsLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [appliedQuery, setAppliedQuery] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<'all' | BillingModelType>('all')
  const [editingModel, setEditingModel] = React.useState<ModelForm | null>(null)
  const [editingModelId, setEditingModelId] = React.useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [modelSaving, setModelSaving] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // 分发计费
  const [distribution, setDistribution] = React.useState(0)
  const [configSaving, setConfigSaving] = React.useState(false)

  const loadModels = React.useCallback(async () => {
    setModelsLoading(true)
    try {
      const data = await listBillingModelsApi({
        q: appliedQuery || undefined,
        type: typeFilter === 'all' ? undefined : typeFilter,
      })
      setModels(data.items ?? [])
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('模型列表加载失败')
    } finally {
      setModelsLoading(false)
    }
  }, [appliedQuery, typeFilter])

  React.useEffect(() => {
    loadModels()
  }, [loadModels])

  const loadConfig = React.useCallback(async () => {
    try {
      const cfg = await fetchBillingConfig()
      setDistribution(Number((cfg.distribution as number) ?? 0))
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('计费配置加载失败')
    }
  }, [])

  React.useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const openAddModel = () => {
    setEditingModel(emptyModel())
    setEditingModelId(null)
    setDrawerOpen(true)
  }

  const openEditModel = (m: AdminAiModel) => {
    setEditingModel({
      name: m.name,
      provider: m.provider,
      type: m.type,
      billingMode: m.billingMode,
      unitPrice: m.unitPrice,
      pricingMatrix: m.pricingMatrix ?? null,
      enabled: m.enabled,
    })
    setEditingModelId(m.id)
    setDrawerOpen(true)
  }

  // 切换类型：image/video 需要 pricingMatrix（缺省则套默认模板），其余类型清空矩阵
  const changeType = (newType: BillingModelType) => {
    setEditingModel((prev) => {
      if (!prev) return prev
      const wantMatrix = newType === 'image' || newType === 'video'
      if (!wantMatrix) return { ...prev, type: newType, pricingMatrix: null }
      const by = newType === 'image' ? 'size' : 'resolution_duration'
      const pm =
        prev.pricingMatrix && prev.pricingMatrix.by === by ? prev.pricingMatrix : defaultMatrix(newType)
      return { ...prev, type: newType, pricingMatrix: pm }
    })
  }

  const setMatrixItem = (idx: number, patch: Partial<{ key: string; label: string; multiplier: number }>) =>
    setEditingModel((prev) => {
      if (!prev?.pricingMatrix) return prev
      const items = prev.pricingMatrix.items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
      return { ...prev, pricingMatrix: { ...prev.pricingMatrix, items } }
    })

  const addMatrixItem = () =>
    setEditingModel((prev) => {
      if (!prev?.pricingMatrix) return prev
      return {
        ...prev,
        pricingMatrix: {
          ...prev.pricingMatrix,
          items: [...prev.pricingMatrix.items, { key: '', label: '', multiplier: 1 }],
        },
      }
    })

  const removeMatrixItem = (idx: number) =>
    setEditingModel((prev) => {
      if (!prev?.pricingMatrix) return prev
      return {
        ...prev,
        pricingMatrix: { ...prev.pricingMatrix, items: prev.pricingMatrix.items.filter((_, i) => i !== idx) },
      }
    })

  const saveModel = async () => {
    if (!editingModel) return
    if (!editingModel.name.trim() || !editingModel.provider.trim()) {
      return toast.error('请填写模型名称与提供方')
    }
    setModelSaving(true)
    try {
      // 用 upsert 接口返回值直接更新本地数组，不依赖二次 GET（避免缓存 / 渲染调度问题）
      if (editingModelId) {
        const saved = await updateBillingModelApi(editingModelId, editingModel)
        setModels((prev) => prev.map((m) => (m.id === editingModelId ? saved : m)))
        toast.success('模型已更新')
      } else {
        const created = await createBillingModelApi(editingModel)
        setModels((prev) => [...prev, created])
        toast.success('模型已创建')
      }
      setDrawerOpen(false)
      setEditingModel(null)
      setEditingModelId(null)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('保存失败')
    } finally {
      setModelSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    setDeleting(true)
    try {
      await deleteBillingModelApi(deletingId)
      // 直接从本地数组移除该 id，不刷新整列表
      setModels((prev) => prev.filter((m) => m.id !== deletingId))
      toast.success('已删除')
      setDeletingId(null)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const saveDistribution = async () => {
    setConfigSaving(true)
    try {
      await updateBillingDistributionApi(distribution)
      toast.success('分发计费已保存')
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('保存失败')
    } finally {
      setConfigSaving(false)
    }
  }

  const columns = React.useMemo<ColumnDef<AdminAiModel, unknown>[]>(
    () => [
      {
        header: '模型',
        accessorKey: 'name',
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium text-foreground">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">{row.original.provider}</p>
          </div>
        ),
      },
      {
        header: '类型',
        accessorKey: 'type',
        size: 100,
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px] uppercase">
            {row.original.type}
          </Badge>
        ),
      },
      {
        header: '计费模式',
        accessorKey: 'billingMode',
        size: 120,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.billingMode === 'fixed' ? '固定' : '按量'}
          </span>
        ),
      },
      {
        header: '单价（积分）',
        accessorKey: 'unitPrice',
        size: 140,
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.unitPrice.toLocaleString()}
            <span className="ml-1 text-xs text-muted-foreground">积分</span>
          </span>
        ),
      },
      {
        header: '状态',
        accessorKey: 'enabled',
        size: 90,
        cell: ({ row }) =>
          row.original.enabled ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
              启用
            </Badge>
          ) : (
            <Badge variant="secondary">禁用</Badge>
          ),
      },
      {
        id: 'actions',
        header: '操作',
        size: 140,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                openEditModel(row.original)
              }}
            >
              <Pencil className="size-3.5" strokeWidth={2.25} />
              编辑
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                setDeletingId(row.original.id)
              }}
            >
              <Trash2 className="size-3.5" strokeWidth={2.25} />
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
        title="收费配置"
        description="AI 模型计费 / 分发计费"
        icon={CreditCard}
        iconAccent="primary"
        breadcrumbs={[{ label: '计费与订单' }, { label: '收费配置' }]}
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="models" className="gap-2">
            <Layers className="size-3.5" strokeWidth={2.25} />
            AI 模型
          </TabsTrigger>
          <TabsTrigger value="distribution" className="gap-2">
            <CreditCard className="size-3.5" strokeWidth={2.25} />
            分发计费
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: AI 模型 */}
        <TabsContent value="models" className="space-y-3">
          <FilterBar
            search={
              <SearchInput
                value={search}
                onChange={setSearch}
                onSubmit={(v) => setAppliedQuery(v.trim())}
                onDebouncedChange={(v) => setAppliedQuery(v.trim())}
                placeholder="搜索模型名 / 提供方…"
              />
            }
            filters={
              <ButtonGroup
                value={typeFilter}
                onChange={setTypeFilter}
                options={[
                  { value: 'all', label: '全部' },
                  { value: 'text', label: '文本' },
                  { value: 'image', label: '图片' },
                  { value: 'video', label: '视频' },
                  { value: 'audio', label: '音频' },
                  { value: 'multimodal', label: '多模态' },
                ]}
                size="sm"
              />
            }
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadModels}
                  disabled={modelsLoading}
                >
                  {modelsLoading ? (
                    <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
                  ) : (
                    <RefreshCw className="size-3.5" strokeWidth={2.25} />
                  )}
                  刷新
                </Button>
                <Button size="sm" onClick={openAddModel}>
                  <Plus className="size-3.5" strokeWidth={2.25} />
                  新增模型
                </Button>
              </>
            }
          />
          <DataTable
            columns={columns}
            data={models}
            loading={modelsLoading}
            rowKey={(r) => r.id}
          />
        </TabsContent>

        {/* Tab 2: 分发计费 */}
        <TabsContent value="distribution" className="space-y-4">
          <SectionCard
            title="分发计费"
            description="国内发布 / 海外分发时，按本次发布的账号数 × 单价扣积分，并写入用户「用量明细」流水"
            icon={CreditCard}
            iconAccent="rose"
          >
            <ProForm layout="1-col">
              <ProFormField label="单个账号单价" hint="每发布到 1 个社媒账号扣除的积分">
                <NumberInput
                  value={distribution}
                  onChange={setDistribution}
                  min={0}
                  suffix="积分 / 账号"
                  className="max-w-xs"
                />
              </ProFormField>
            </ProForm>
          </SectionCard>

          <div className="sticky bottom-0 flex justify-end gap-2 rounded-xl border border-border bg-card p-3 shadow-soft">
            <Button onClick={saveDistribution} disabled={configSaving}>
              {configSaving ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />
              ) : (
                <Save className="size-4" strokeWidth={2.25} />
              )}
              保存配置
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* 模型编辑 Drawer */}
      <DetailDrawer
        open={drawerOpen}
        onOpenChange={(o) => !modelSaving && setDrawerOpen(o)}
        title={editingModelId ? '编辑模型' : '新增模型'}
        description="所有单价均以「积分」为单位"
        width="xl"
        padded={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={modelSaving}>
              取消
            </Button>
            <Button onClick={saveModel} disabled={modelSaving}>
              {modelSaving && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              保存
            </Button>
          </div>
        }
      >
        {editingModel && (
          <ProForm layout="2-col" className="p-5">
            <ProFormField label="模型名称" required>
              <Input
                value={editingModel.name}
                onChange={(e) => setEditingModel({ ...editingModel, name: e.target.value })}
                placeholder="例如 gpt-5.4-nano"
              />
            </ProFormField>
            <ProFormField label="提供方" required>
              <Input
                value={editingModel.provider}
                onChange={(e) => setEditingModel({ ...editingModel, provider: e.target.value })}
                placeholder="例如 OpenAI / Doubao"
              />
            </ProFormField>
            <ProFormField label="类型" required>
              <ButtonGroup
                fullWidth
                value={editingModel.type}
                onChange={(v) => changeType(v as BillingModelType)}
                options={[
                  { value: 'text', label: '文本' },
                  { value: 'image', label: '图片' },
                  { value: 'video', label: '视频' },
                  { value: 'audio', label: '音频' },
                  { value: 'multimodal', label: '多模态' },
                ]}
              />
            </ProFormField>
            <ProFormField label="计费模式" required>
              <ButtonGroup
                fullWidth
                value={editingModel.billingMode}
                onChange={(v) =>
                  setEditingModel({ ...editingModel, billingMode: v as BillingMode })
                }
                options={[
                  { value: 'pay_as_you_go', label: '按量计费' },
                  { value: 'fixed', label: '固定单价' },
                ]}
              />
            </ProFormField>
            <ProFormField
              label="基准单价（积分）"
              required
              hint="文本：千 Token 单价；图片/视频：基础积分；音频：分钟单价"
              fullWidth
            >
              <NumberInput
                value={editingModel.unitPrice}
                onChange={(v) => setEditingModel({ ...editingModel, unitPrice: v })}
                min={0}
                step={0.0001}
                precision={4}
                suffix="积分"
              />
            </ProFormField>

            {(editingModel.type === 'image' || editingModel.type === 'video') &&
              editingModel.pricingMatrix && (
                <ProFormField
                  label="规格倍率（pricingMatrix）"
                  fullWidth
                  hint={
                    editingModel.type === 'image'
                      ? '实际扣费 = 基准单价 × 命中规格的倍率。key 必须与生成时实际传入的尺寸串完全一致（如 2560x1440 / 1920x1920），否则按 ×1 计费'
                      : '实际扣费 = 基准单价 × 命中倍率 × 时长(秒)。key 必须与生成时实际分辨率一致（如 720p / 1080p / 2k / 4k），否则按 ×1 计费'
                  }
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-0.5 text-xs text-muted-foreground">
                      <span className="flex-1">规格 key（机器值）</span>
                      <span className="flex-1">显示名</span>
                      <span className="w-28">倍率</span>
                      <span className="w-8" />
                    </div>
                    {editingModel.pricingMatrix.items.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          value={it.key}
                          onChange={(e) => setMatrixItem(idx, { key: e.target.value })}
                          placeholder={editingModel.type === 'image' ? '如 2560x1440' : '如 1080p'}
                          className="flex-1 font-mono"
                        />
                        <Input
                          value={it.label}
                          onChange={(e) => setMatrixItem(idx, { label: e.target.value })}
                          placeholder="如 2K"
                          className="flex-1"
                        />
                        <NumberInput
                          value={it.multiplier}
                          onChange={(v) => setMatrixItem(idx, { multiplier: v })}
                          min={0}
                          step={0.05}
                          precision={2}
                          suffix="×"
                          className="w-28"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => removeMatrixItem(idx)}
                          title="删除该规格"
                        >
                          <Trash2 className="size-3.5" strokeWidth={2.25} />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addMatrixItem}>
                      <Plus className="size-3.5" strokeWidth={2.25} />
                      添加规格
                    </Button>
                  </div>
                </ProFormField>
              )}

            <ProFormField label="启用" fullWidth>
              <div className="flex h-9 items-center gap-2">
                <Switch
                  checked={editingModel.enabled}
                  onCheckedChange={(v) => setEditingModel({ ...editingModel, enabled: v })}
                />
                <span className="text-sm text-muted-foreground">
                  {editingModel.enabled ? '启用' : '已禁用'}
                </span>
              </div>
            </ProFormField>
          </ProForm>
        )}
      </DetailDrawer>

      {/* 删除确认 */}
      <AlertDialog
        open={!!deletingId}
        onOpenChange={(o) => !deleting && !o && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除该模型？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该模型的计费规则将立即失效。此操作无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}
