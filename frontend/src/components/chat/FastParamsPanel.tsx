import { LayoutTemplate } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  FAST_TEMPLATES,
  type FastParams,
  type FastType,
} from '@/pages/chat/fastConfig'

export type FastParamsPanelProps = {
  type: FastType
  params: FastParams
  onChange: (next: FastParams) => void
  /** 选中模板回填到 textarea + 标记 template_label */
  onTemplateSelect?: (label: string, value: string) => void
  disabled?: boolean
  className?: string
}

/**
 * 快速模式参数面板：模板 chips 横排 + 文章的 brand_info 输入。
 * 模型/尺寸/分辨率/时长/音频 等参数迁移到工具栏内 FastParamsDropdown。
 */
export function FastParamsPanel({
  type,
  params,
  onChange,
  onTemplateSelect,
  disabled,
  className,
}: FastParamsPanelProps) {
  const templates = FAST_TEMPLATES[type]

  return (
    <div
      className={cn(
        'space-y-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5',
        disabled && 'opacity-60',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <LayoutTemplate className="size-3.5 text-primary" strokeWidth={2.25} aria-hidden />
        模板
      </div>
      {/* 模板只是「一键填充提示词」，点击后不进入选中态（生成内容与模板本身无关） */}
      <div className="flex flex-wrap gap-1.5">
        {templates.map((tpl) => (
          <button
            key={tpl.label}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (type === 'article') {
                onChange({
                  ...params,
                  article: { ...params.article, template_label: tpl.label },
                })
              }
              onTemplateSelect?.(tpl.label, tpl.value)
            }}
            className={cn(
              'inline-flex cursor-pointer items-center rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground/75 transition-app hover:-translate-y-px hover:border-primary/40 hover:bg-primary/[0.08] hover:text-primary hover:shadow-soft',
              disabled && 'cursor-not-allowed opacity-60 hover:translate-y-0',
            )}
          >
            {tpl.label}
          </button>
        ))}
      </div>

    </div>
  )
}
