/**
 * MarkDown2 — high-fidelity Markdown renderer for AI chat streams
 *
 * Features:
 *  - markdown-it (v13) with hljs code highlighting + KaTeX math
 *  - Mermaid diagram rendering (async, cached)
 *  - <think> block collapsible panel (DeepSeek / R1 models)
 *  - Incremental DOM updates during SSE streaming (no full-page flicker)
 *  - Event delegation: click code to copy, click think-header to expand
 *
 * Usage:
 *   <MarkDown2 content={text} loading={isStreaming} />
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import MarkdownIt from 'markdown-it'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import mkKatexRaw from '@vscode/markdown-it-katex'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'
import 'katex/dist/katex.min.css'
import { toast } from '@/components/common/Toast'
import { cn } from '@/utils/helpers'
import { incrementalRender } from './incremental'
import { createMermaidRenderer } from './mermaid'
import { processThinkingContent, renderThinkBlock } from './thinking'
import './md2.css'

// CJS interop: the plugin may be double-wrapped depending on the bundler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mkKatex: (md: MarkdownIt) => void = (typeof mkKatexRaw === 'function' ? mkKatexRaw : (mkKatexRaw as any).default) as (md: MarkdownIt) => void

export interface MarkDown2Props {
  content: string
  loading?: boolean
  autoScroll?: boolean
  scrollContainerRef?: React.RefObject<HTMLElement | null>
  className?: string
  theme?: 'dark' | 'light'
}

export default function MarkDown2({
  content,
  loading,
  autoScroll = false,
  scrollContainerRef,
  className,
  theme = 'dark',
}: MarkDown2Props) {
  const [showThink, setShowThink] = useState(false)

  const containerRef   = useRef<HTMLDivElement>(null)
  const mdRef          = useRef<MarkdownIt | null>(null)
  const mermaidCache   = useRef<Map<number, string>>(new Map())
  const renderMermaid  = useRef(createMermaidRenderer(mermaidCache)).current
  const showThinkRef   = useRef(showThink)
  const loadingRef     = useRef(loading)

  // Keep refs in sync without causing re-renders inside the render callback
  showThinkRef.current = showThink
  loadingRef.current   = loading

  /* ── Initialize markdown-it once (sync, both deps are statically imported) ── */
  useEffect(() => {
    const md = new MarkdownIt({
      html: true,
      breaks: true,
      linkify: true,
      typographer: true,
      highlight: (str, lang) => {
        const escaped = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        if (lang && hljs.getLanguage(lang)) {
          try {
            return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
          } catch {/* fall through */}
        }
        return `<pre class="hljs"><code>${escaped}</code></pre>`
      },
    })
    md.use(mkKatex)
    mdRef.current = md
  }, [])

  /* ── Core render function ── */
  const doRender = useCallback(() => {
    const md        = mdRef.current
    const container = containerRef.current
    if (!md || !container || !content) return

    const processedContent = processThinkingContent(content)

    let mermaidCount   = 0
    let isInThinking   = false
    let thinkingContent = ''

    /* Fence rule – mermaid or hljs */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalFence: any =
      md.renderer.rules.fence ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((tokens: any[], idx: number, options: any, _env: unknown, self: any) =>
        self.renderToken(tokens, idx, options))

    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const info = tokens[idx].info.trim()
      if (info === 'mermaid') {
        mermaidCount++
        return renderMermaid(tokens[idx].content, mermaidCount)
      }
      return originalFence(tokens, idx, options, env, self)
    }

    /* Inline code – clickable to copy */
    md.renderer.rules.code_inline = (tokens, idx) => {
      const safe = md.utils.escapeHtml(tokens[idx].content)
      return `<code class="md2-code-inline">${safe}</code>`
    }

    /* Heading: downgrade h1 → h2 */
    md.renderer.rules.heading_open = (tokens, idx) => {
      const token = tokens[idx]
      if (token.tag === 'h1') token.tag = 'h2'
      return `<${token.tag}>`
    }
    md.renderer.rules.heading_close = (tokens, idx) => {
      const token = tokens[idx]
      if (token.tag === 'h1') token.tag = 'h2'
      return `</${token.tag}>`
    }

    /* Links: open in new tab */
    md.renderer.rules.link_open = (tokens, idx) => {
      const href = md.utils.escapeHtml(tokens[idx].attrGet('href') ?? '')
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="md2-link">`
    }

    /* HTML block: handle <think>, <error>, escape everything else */
    md.renderer.rules.html_block = (tokens, idx) => {
      const c = tokens[idx].content
      if (c.includes('<think>'))  { isInThinking = true; return '' }
      if (c.includes('</think>')) {
        isInThinking = false
        const html = renderThinkBlock(thinkingContent.trim(), showThinkRef.current, loadingRef.current)
        thinkingContent = ''
        return html
      }
      if (isInThinking)           { thinkingContent += c; return '' }
      if (c.includes('<error>'))  return '<span class="md2-error">'
      if (c.includes('</error>')) return '</span>'
      // Escape all other raw HTML to prevent XSS
      return md.utils.escapeHtml(c)
    }

    /* html_inline: handle <think> on same line */
    md.renderer.rules.html_inline = (tokens, idx) => {
      const c = tokens[idx].content
      if (c.includes('<think>'))  { isInThinking = true; return '' }
      if (c.includes('</think>')) {
        isInThinking = false
        const html = renderThinkBlock(thinkingContent.trim(), showThinkRef.current, loadingRef.current)
        thinkingContent = ''
        return html
      }
      if (isInThinking)           { thinkingContent += c; return '' }
      return md.utils.escapeHtml(c)
    }

    const newHtml = md.render(processedContent)
    incrementalRender(container, newHtml)

    /* Auto-scroll the external container if requested */
    if (autoScroll && scrollContainerRef?.current) {
      const sc = scrollContainerRef.current
      sc.scrollTop = sc.scrollHeight
    }
  }, [content, showThink, renderMermaid, autoScroll, scrollContainerRef])

  /* Trigger render whenever content or think-toggle changes */
  useEffect(() => {
    doRender()
  }, [doRender])

  /* ── Event delegation: copy + think toggle ── */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      /* Think-block toggle */
      if (target.closest('[data-action="toggle-think"]')) {
        setShowThink(v => !v)
        return
      }

      /* Copy code block */
      const pre = target.closest('pre.hljs')
      if (pre) {
        const code = pre.querySelector('code')?.textContent ?? ''
        void navigator.clipboard.writeText(code.trimEnd()).then(() => toast.success('已复制'))
        return
      }

      /* Copy inline code */
      const inlineCode = target.closest('.md2-code-inline')
      if (inlineCode) {
        void navigator.clipboard.writeText(inlineCode.textContent ?? '').then(() => toast.success('已复制'))
      }
    }

    el.addEventListener('click', handler)
    return () => el.removeEventListener('click', handler)
  }, [])

  return (
    <div className={cn('md2-body', theme === 'light' && 'md2-light', className)}>
      <div ref={containerRef} />
    </div>
  )
}
