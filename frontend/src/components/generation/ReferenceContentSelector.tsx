import { useMemo, useState } from 'react'
import { Ban, Database, ListChecks, Pencil } from 'lucide-react'
import { cn } from '@/utils/helpers'
import type { ReferenceConfig, ReferenceMode } from '@/types/generation'
import { ReferenceDialog } from '@/components/chat/ReferenceDialog'
import { FieldLabel } from '@/components/generation/FieldLabel'
import {
  refKey,
  refsToIds,
  configToRefs,
  type SelectedReference,
} from '@/pages/chat/composerUtils'

export type ReferenceContentSelectorProps = {
  value: ReferenceConfig
  onChange: (v: ReferenceConfig) => void
  /** media=图片/视频（auto 只注入企业档案）；article=文章（auto 额外按需检索文档） */
  variant?: 'article' | 'media'
  disabled?: boolean
  className?: string
}

const MODES: { mode: ReferenceMode; label: string; icon: typeof Database }[] = [
  { mode: 'none', label: '不参考', icon: Ban },
  { mode: 'auto', label: '检索知识库', icon: Database },
  { mode: 'custom', label: '自定义', icon: ListChecks },
]

const DIM_LABELS: { key: keyof ReferenceConfig; label: string }[] = [
  { key: 'company_ids', label: '公司' },
  { key: 'brand_ids', label: '品牌' },
  { key: 'product_ids', label: '产品' },
  { key: 'customer_ids', label: '客户' },
  { key: 'case_ids', label: '案例' },
  { key: 'document_ids', label: '文档' },
]

const MAX_CUSTOM_DOCS = 2

/** 「参考内容」选择器：不参考（默认）/ 检索知识库 / 自定义。自定义复用「挂载参考素材」弹窗。 */
export function ReferenceContentSelector({ value, onChange, variant = 'media', disabled, className }: ReferenceContentSelectorProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  // 自定义选择的素材（含真实名称）；初始/编辑场景从 value 的 ID 反推占位，保证勾选态与不丢 ID
  const [customRefs, setCustomRefs] = useState<SelectedReference[]>([])
  const mode = value.mode ?? 'none'

  const customSummary = useMemo(() => {
    const parts = DIM_LABELS
      .map(({ key, label }) => {
        const arr = value[key]
        return Array.isArray(arr) && arr.length ? `${label}×${arr.length}` : null
      })
      .filter(Boolean)
    return parts.join('、')
  }, [value])

  // 弹窗勾选态：合并 value（占位）+ customRefs（真实名称优先），按 refKey 去重
  const dialogSelected = useMemo(() => {
    const byKey = new Map<string, SelectedReference>()
    for (const r of configToRefs(value)) byKey.set(refKey(r), r)
    for (const r of customRefs) byKey.set(refKey(r), r)
    return [...byKey.values()]
  }, [value, customRefs])

  // 图片在生成页单独作参考图，这里隐藏；media（图/视频）不注入文档全文，再隐藏文档
  const hideTabs = useMemo(
    () => (variant === 'media' ? (['image', 'document'] as const) : (['image'] as const)),
    [variant],
  )

  const onConfirm = (refs: SelectedReference[]) => {
    setCustomRefs(refs)
    onChange({ mode: 'custom', ...refsToIds(refs) })
  }

  return (
    <div className={cn('space-y-2', className)}>
      <FieldLabel>参考知识库</FieldLabel>

      <div className="grid grid-cols-3 gap-2">
        {MODES.map((m) => {
          const active = mode === m.mode
          return (
            <button
              key={m.mode}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...value, mode: m.mode })}
              className={cn(
                'flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-app disabled:cursor-not-allowed disabled:opacity-60',
                active
                  ? 'border-primary/40 bg-primary/10 text-primary shadow-soft'
                  : 'border-border bg-card text-foreground/80 hover:border-primary/30 hover:bg-muted',
              )}
            >
              <m.icon className="size-4" />
              {m.label}
            </button>
          )
        })}
      </div>

      {mode === 'auto' && (
        <p className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {variant === 'article'
            ? '将参考你的企业档案（公司/品牌/产品/客户/案例），并按需检索知识库文档。'
            : '将参考你的企业档案（公司/品牌/产品/客户/案例）辅助生成。'}
        </p>
      )}

      {mode === 'none' && (
        <p className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          不参考任何企业资料或文档。
        </p>
      )}

      {mode === 'custom' && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-3 py-2.5">
          <div className="min-w-0 flex-1 text-xs">
            {customSummary
              ? <span className="text-foreground/80">已选：{customSummary}</span>
              : <span className="text-muted-foreground">尚未选择，点右侧按钮挑选参考内容</span>}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPickerOpen(true)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-app hover:bg-primary/15 disabled:opacity-60"
          >
            <Pencil className="size-3.5" />{customSummary ? '重新选择' : '选择参考内容'}
          </button>
        </div>
      )}

      <ReferenceDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selected={dialogSelected}
        onConfirm={onConfirm}
        hideTabs={[...hideTabs]}
        initialTab="brand"
        title="选择参考内容"
        description={
          variant === 'media'
            ? '勾选公司/品牌/产品/客户/案例，生成时只参考所选内容。'
            : `勾选公司/品牌/产品/客户/案例与文档（文档最多 ${MAX_CUSTOM_DOCS} 个），生成时只参考所选内容。`
        }
        maxDocuments={MAX_CUSTOM_DOCS}
      />
    </div>
  )
}
