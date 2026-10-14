import * as React from 'react'
import MarkdownIt from 'markdown-it'

import { cn } from '@/lib/utils'

// 后台 Skill 提示词预览：纯展示，关闭原始 HTML（提示词来源不可信，防 XSS）
const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: true })

/** 渲染一段 markdown（用于 Skill 提示词预览）。 */
export function MarkdownPreview({ content, className }: { content: string; className?: string }) {
  const html = React.useMemo(() => md.render(content || ''), [content])
  return (
    <div
      className={cn(
        'text-sm leading-relaxed text-foreground',
        '[&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-bold',
        '[&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold',
        '[&_h3]:mb-1 [&_h3]:mt-2.5 [&_h3]:text-sm [&_h3]:font-semibold',
        '[&_p]:my-2 [&_strong]:font-semibold',
        '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]',
        '[&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-[12px] [&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_a]:text-primary [&_a]:underline',
        '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
        '[&_hr]:my-3 [&_hr]:border-border',
        '[&_table]:my-2 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
