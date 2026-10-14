import { useTranslation } from 'react-i18next'
import { LayoutTemplate } from 'lucide-react'
import { TextArea } from '@/components/form/TextArea'
import { cn } from '@/utils/helpers'

export type TemplateItem = string | { label: string; value: string }

export type PromptInputProps = {
  value: string
  onChange: (value: string) => void
  onTemplateSelect?: (label: string) => void
  placeholder?: string
  /** 支持纯文本数组或 {label, value} 对象数组 */
  templates?: TemplateItem[]
  className?: string
}

export function PromptInput({ value, onChange, onTemplateSelect, placeholder, templates, className }: PromptInputProps) {
  const { t } = useTranslation()

  function getLabel(tpl: TemplateItem): string {
    if (typeof tpl === 'string') return tpl.length > 40 ? `${tpl.slice(0, 40)}…` : tpl
    return tpl.label
  }

  function getValue(tpl: TemplateItem): string {
    return typeof tpl === 'string' ? tpl : tpl.value
  }

  return (
    <div className={cn('space-y-3', className)}>
      {templates && templates.length > 0 && (
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <LayoutTemplate className="size-3.5 text-primary" aria-hidden />
            {t('generation.templates', '模板')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((tpl, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onChange(getValue(tpl))
                  onTemplateSelect?.(getLabel(tpl))
                }}
                className="cursor-pointer rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground/75 transition-app hover:-translate-y-px hover:border-primary/40 hover:bg-primary/[0.08] hover:text-primary hover:shadow-soft"
              >
                {getLabel(tpl)}
              </button>
            ))}
          </div>
        </div>
      )}
      <TextArea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('generation.promptPlaceholder', '描述您想要创建的内容…')}
        rows={8}
        className="font-[family-name:var(--font-mono)] text-[13px] leading-relaxed resize-y"
      />
    </div>
  )
}
