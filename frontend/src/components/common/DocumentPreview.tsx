/**
 * DocumentPreview — full-featured document preview overlay
 *
 * Render strategy (all Office libs are lazy-loaded on first use):
 *  .md / .markdown  → react-markdown + remark-gfm
 *  .txt / .rtf      → plain-text <pre>
 *  .csv             → PapaParse → styled HTML table
 *  .html / .htm     → sandboxed <iframe srcdoc>
 *  .pdf             → browser-native <iframe src>
 *  .docx            → docx-preview  (lazy)  ← renders into div
 *  .xlsx            → xlsx-preview  (lazy)  ← converts to HTML table
 *  .pptx / .ppt     → pptx-preview  (lazy)  ← renders slides
 *  .doc / .xls / .epub / .odt → download fallback (no JS parser)
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, ExternalLink, FileText, Loader2, X } from 'lucide-react'
import { cn } from '@/utils/helpers'
import { extOf as _extOf, getFileMeta } from '@/utils/fileTypes'
import MarkDown2 from '@/components/markdown2'

/* ─────────────── types ─────────────── */

export type DocumentPreviewProps = {
  url: string
  /**
   * 原始文件名（含扩展名），用于 header 展示与格式回退推断。
   * 当 fileType 已提供时，fileName 不影响渲染模式，可传任意字符串。
   */
  fileName: string
  /**
   * ✅ 推荐：直接指定文件格式，避免依赖 fileName 扩展名推断。
   * 可选值：'pdf' | 'docx' | 'xlsx' | 'pptx' | 'md' | 'txt' | 'csv' | 'html'
   * 未提供时降级为从 fileName 提取扩展名，若 fileName 无扩展名则显示"格式暂不支持"。
   * 正确用法：从后端 document.file_type 或 document.file_name 中取值。
   */
  fileType?: string
  title?: string
  onClose: () => void
}

type RenderMode =
  | 'md' | 'txt' | 'csv' | 'html' | 'pdf'
  | 'docx' | 'xlsx' | 'pptx'
  | 'download'

/* ─────────────── helpers ─────────────── */

function extOf(name: string): string {
  return _extOf(name)
}

function detectMode(name: string, fileType?: string): RenderMode {
  // fileType 优先：直接用明确指定的格式，不依赖 fileName 扩展名
  const ext = (fileType ?? extOf(name)).toLowerCase().replace(/^\./, '')
  if (ext === 'md' || ext === 'markdown') return 'md'
  if (ext === 'txt' || ext === 'rtf') return 'txt'
  if (ext === 'csv') return 'csv'
  if (ext === 'html' || ext === 'htm') return 'html'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'xlsx') return 'xlsx'
  if (ext === 'pptx' || ext === 'ppt') return 'pptx'
  // doc / xls / epub / odt → no reliable pure-JS parser
  return 'download'
}


/* ─────────────── shared header strip ─────────────── */

function PreviewHeader({
  url,
  fileName,
  displayTitle,
  onClose,
}: {
  url: string
  fileName: string
  displayTitle: string
  onClose: () => void
}) {
  const meta = getFileMeta(extOf(fileName))
  const Icon = meta.icon
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-3">
      <Icon className={cn('size-5 shrink-0', meta.iconClass)} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {displayTitle}
      </span>
      <span className={cn('badge shrink-0 text-[10px]', meta.badgeClass)}>
        {meta.label || extOf(fileName).toUpperCase()}
      </span>
      <a
        href={url}
        download={fileName}
        onClick={(e) => e.stopPropagation()}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 shadow-xs transition-app hover:border-primary/30 hover:bg-accent hover:text-foreground"
      >
        <Download className="size-3.5" strokeWidth={2.2} />
        下载
      </a>
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="cursor-pointer rounded-lg border border-border bg-card p-1.5 text-foreground/70 shadow-xs transition-app hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="size-4" strokeWidth={2.2} />
      </button>
    </div>
  )
}

/* ─────────────── shared ESC + body-lock hook ─────────────── */

function usePreviewEffect(onClose: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = prev
    }
  }, [onClose])
}

/* ─────────────── full-screen variant (original) ─────────────── */

export function DocumentPreview({ url, fileName, fileType, title, onClose }: DocumentPreviewProps) {
  const mode = detectMode(fileName, fileType)
  const displayTitle = title ?? fileName
  usePreviewEffect(onClose)

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="doc-preview-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[9999] flex flex-col bg-background backdrop-blur-md"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <PreviewHeader url={url} fileName={fileName} displayTitle={displayTitle} onClose={onClose} />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <DocumentBody mode={mode} url={url} fileName={fileName} />
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

/* ─────────────── modal (dialog) variant ─────────────── */

export type DocumentPreviewModalProps = DocumentPreviewProps

export function DocumentPreviewModal({ url, fileName, fileType, title, onClose }: DocumentPreviewModalProps) {
  const mode = detectMode(fileName, fileType)
  const displayTitle = title ?? fileName
  usePreviewEffect(onClose)

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="doc-preview-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          key="doc-preview-modal"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative flex flex-col w-full max-w-4xl h-[85vh] rounded-2xl border border-border bg-background overflow-hidden shadow-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <PreviewHeader url={url} fileName={fileName} displayTitle={displayTitle} onClose={onClose} />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <DocumentBody mode={mode} url={url} fileName={fileName} />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

/* ─────────────── body dispatcher ─────────────── */

function DocumentBody({ mode, url, fileName }: { mode: RenderMode; url: string; fileName: string }) {
  if (mode === 'pdf') {
    return <iframe src={url} className="flex-1 w-full border-0" title="pdf" />
  }
  if (mode === 'md') return <MarkdownRenderer url={url} />
  if (mode === 'txt') return <TextRenderer url={url} />
  if (mode === 'csv') return <CsvRenderer url={url} />
  if (mode === 'html') return <HtmlRenderer url={url} />
  if (mode === 'docx') return <DocxRenderer url={url} />
  if (mode === 'xlsx') return <XlsxRenderer url={url} />
  if (mode === 'pptx') return <PptxRenderer url={url} />
  return <DownloadFallback url={url} fileName={fileName} />
}

/* ─────────────── shared fetch hook ─────────────── */

function useFetchText(url: string) {
  const [text, setText] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setState('loading')
    setText(null)
    setError(null)
    fetch(url)
      .then(async (r) => {
        if (!r.ok) {
          const errMsg = `HTTP ${r.status} ${r.statusText}`
          console.error('[DocumentPreview] useFetchText 非 2xx 响应', { url, status: r.status, statusText: r.statusText })
          throw new Error(errMsg)
        }
        setText(await r.text())
        setState('done')
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[DocumentPreview] useFetchText 失败', { url, error: err, message: msg })
        setError(msg)
        setState('error')
      })
  }, [url])

  return { text, state, error }
}

function useFetchBuffer(url: string) {
  const [buf, setBuf] = useState<ArrayBuffer | null>(null)
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setState('loading')
    setBuf(null)
    setError(null)
    fetch(url)
      .then(async (r) => {
        if (!r.ok) {
          const errMsg = `HTTP ${r.status} ${r.statusText}`
          console.error('[DocumentPreview] useFetchBuffer 非 2xx 响应', { url, status: r.status, statusText: r.statusText })
          throw new Error(errMsg)
        }
        setBuf(await r.arrayBuffer())
        setState('done')
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        // 浏览器 fetch 跨域受限：如果浏览器地址栏能直开但这里失败，多半是 MinIO 没配 CORS
        console.error(
          '[DocumentPreview] useFetchBuffer 失败 (常见原因：CORS / 文件不存在 / 网络异常)',
          { url, error: err, message: msg },
        )
        setError(msg)
        setState('error')
      })
  }, [url])

  return { buf, state, error }
}

/* ─────────────── loading / error ─────────────── */

function Loading({ label }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-muted">
      <Loader2 className="size-8 animate-spin text-neon-cyan" />
      {label && <p className="text-xs">{label}</p>}
    </div>
  )
}

function FetchError({ detail }: { detail?: string | null } = {}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-neon-red">
      <FileText className="size-12 opacity-40" />
      <p className="text-sm">文件加载失败，请检查文件是否可访问</p>
      {detail && (
        <p className="max-w-md break-words text-center text-xs text-text-muted">
          错误详情：{detail}
        </p>
      )}
      <p className="text-[11px] text-text-muted/70">
        更详细的错误信息可在浏览器开发者工具的 Console 面板查看
      </p>
    </div>
  )
}

/* ─────────────── renderers ─────────────── */

function MarkdownRenderer({ url }: { url: string }) {
  const { text, state } = useFetchText(url)
  if (state === 'error') return <FetchError />
  if (state !== 'done' || text === null) return <Loading label="加载中…" />
  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="mx-auto max-w-6xl px-10 py-8">
        <MarkDown2 content={text} autoScroll={false} theme="light" />
      </div>
    </div>
  )
}

function TextRenderer({ url }: { url: string }) {
  const { text, state } = useFetchText(url)
  if (state === 'error') return <FetchError />
  if (state !== 'done' || text === null) return <Loading label="加载中…" />
  return (
    <div className="flex-1 overflow-auto px-6 py-6">
      <pre className="min-w-0 whitespace-pre-wrap break-words rounded-2xl bg-bg-card/80 p-5 font-[family-name:var(--font-mono)] text-sm leading-relaxed text-text-secondary border border-white/[0.06]">
        {text}
      </pre>
    </div>
  )
}

function CsvRenderer({ url }: { url: string }) {
  const { text, state } = useFetchText(url)
  const [rows, setRows] = useState<string[][]>([])

  useEffect(() => {
    if (state !== 'done' || !text) return
    import('papaparse').then(({ default: Papa }) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const result = (Papa.parse as (data: string, config: object) => { data: string[][] })(text, { skipEmptyLines: true })
      setRows(result.data)
    })
  }, [text, state])

  if (state === 'error') return <FetchError />
  if (state !== 'done' || rows.length === 0) return <Loading label="解析 CSV…" />

  const headers = rows[0]
  const body = rows.slice(1)

  return (
    <div className="flex-1 overflow-auto bg-white">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3 text-left font-semibold text-gray-800 border-b border-gray-200 whitespace-nowrap text-xs uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className={cn('transition-colors', ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/60', 'hover:bg-blue-50/50')}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-2.5 text-gray-700 border-b border-gray-100 max-w-[300px] truncate text-sm">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sticky bottom-0 px-4 py-2 text-right text-xs text-gray-400 bg-gray-50 border-t border-gray-200">
        {body.length} 行 × {headers.length} 列
      </div>
    </div>
  )
}

function HtmlRenderer({ url }: { url: string }) {
  const { text, state } = useFetchText(url)
  if (state === 'error') return <FetchError />
  if (state !== 'done' || text === null) return <Loading label="加载中…" />
  return (
    <iframe
      srcDoc={text}
      sandbox="allow-same-origin allow-scripts"
      className="flex-1 w-full border-0 bg-white"
      title="html preview"
    />
  )
}

function DocxRenderer({ url }: { url: string }) {
  const { buf, state } = useFetchBuffer(url)
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderState, setRenderState] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle')

  useEffect(() => {
    if (state !== 'done' || !buf || !containerRef.current) return
    setRenderState('rendering')
    const el = containerRef.current
    // clear previous render
    el.innerHTML = ''
    import('docx-preview')
      .then(({ renderAsync }) => renderAsync(buf, el, undefined, {
        className: 'docx-render',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
      }))
      .then(() => setRenderState('done'))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[DocumentPreview] DocxRenderer 渲染失败', { url, error: err, message: msg })
        setRenderState('error')
      })
  }, [buf, state, url])

  return (
    <div className="relative flex-1 overflow-y-auto bg-[#e8eaed]">
      {(state === 'loading' || renderState === 'rendering') && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <Loading label="渲染 Word 文档…" />
        </div>
      )}
      {(state === 'error' || renderState === 'error') && <FetchError />}
      {/* docx-preview 自带白色 page wrapper，外层只需要统一灰底 */}
      <div
        ref={containerRef}
        className="py-8 [&_.docx-render]:mx-auto [&_.docx-render]:shadow-md [&_.docx-render]:rounded-sm"
      />
    </div>
  )
}

type XlsxSheet = { name: string; html: string }

/**
 * 把 sheet_to_json(header:1) 的二维数组转成 HTML 表格字符串。
 * 用作 sheet_to_html 在复杂工作表（含图片 / 嵌入对象 / 不规则 cell）失败时的降级渲染。
 * 第一行作为表头，其余为正文；所有 cell 文本做 HTML 转义防 XSS。
 */
function rowsToHtmlTable(rows: unknown[][]): string {
  if (!rows || rows.length === 0) {
    return '<div style="padding:1rem 1.5rem;color:#999;font-size:13px;">空工作表</div>'
  }
  const escape = (v: unknown): string =>
    String(v ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c),
    )
  const maxCols = rows.reduce((m, r) => Math.max(m, (r ?? []).length), 0)
  const pad = (row: unknown[]): unknown[] => {
    const out = row ?? []
    return out.length >= maxCols ? out : [...out, ...Array(maxCols - out.length).fill('')]
  }
  const [head, ...body] = rows
  const theadCells = pad(head).map((c) => `<th>${escape(c)}</th>`).join('')
  const bodyHtml = body
    .map((row) => '<tr>' + pad(row).map((c) => `<td>${escape(c)}</td>`).join('') + '</tr>')
    .join('')
  return `<table><thead><tr>${theadCells}</tr></thead><tbody>${bodyHtml}</tbody></table>`
}

function XlsxRenderer({ url }: { url: string }) {
  const { buf, state, error: fetchError } = useFetchBuffer(url)
  const [sheets, setSheets] = useState<XlsxSheet[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [renderState, setRenderState] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle')
  const [renderError, setRenderError] = useState<string | null>(null)

  useEffect(() => {
    if (state !== 'done' || !buf) return
    setRenderState('rendering')
    setRenderError(null)
    setActiveIdx(0)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – xlsx ships its own types; tsc resolves it fine
    import('xlsx').then((XLSX) => {
      try {
        const wb = XLSX.read(buf, { type: 'array' })
        const parsed: XlsxSheet[] = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name]
          // sheet_to_html 在含图片 / 合并单元格 / 部分 cell 缺失 .t 字段时会抛
          // `Cannot read properties of undefined (reading 'indexOf')`。这里按 sheet 包
          // try-catch，失败的 sheet 降级用 sheet_to_json 手动渲染保留文本内容
          try {
            const html = XLSX.utils.sheet_to_html(ws, { id: `sheet-${name}`, editable: false })
            return { name, html }
          } catch (sheetErr: unknown) {
            console.warn(
              '[DocumentPreview] sheet_to_html 渲染失败，降级 sheet_to_json',
              { sheet: name, error: sheetErr },
            )
            try {
              const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
              return { name, html: rowsToHtmlTable(rows) }
            } catch (jsonErr: unknown) {
              console.error('[DocumentPreview] sheet_to_json 兜底也失败', { sheet: name, error: jsonErr })
              return {
                name,
                html: `<div style="padding:1rem 1.5rem;color:#999;font-size:13px;">此工作表无法渲染（包含 SheetJS 不支持的内容，如复杂图片 / 嵌入对象）</div>`,
              }
            }
          }
        })
        setSheets(parsed)
        setRenderState('done')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[DocumentPreview] XlsxRenderer 解析失败', { url, error: err, message: msg, bufSize: buf.byteLength })
        setRenderError(msg)
        setRenderState('error')
      }
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[DocumentPreview] XlsxRenderer xlsx 模块加载失败', { url, error: err, message: msg })
      setRenderError(msg)
      setRenderState('error')
    })
  }, [buf, state, url])

  if (state === 'error') return <FetchError detail={fetchError} />
  if (renderState === 'error') return <FetchError detail={renderError} />
  if (state === 'loading' || renderState !== 'done' || sheets.length === 0) {
    return <Loading label="渲染 Excel 表格…" />
  }

  const active = sheets[activeIdx]

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-gray-200 bg-gray-50 px-3 pt-2">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={cn(
                'cursor-pointer shrink-0 rounded-t-md border border-b-0 px-4 py-1.5 text-xs font-medium transition-colors',
                i === activeIdx
                  ? 'border-gray-300 bg-white text-gray-800 shadow-sm'
                  : 'border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700',
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {/* Sheet content */}
      <div className="flex-1 overflow-auto">
        <div
          className="p-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_td]:border [&_td]:border-gray-200 [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-gray-700 [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-gray-700 [&_tr:hover_td]:bg-blue-50/40"
          dangerouslySetInnerHTML={{ __html: active.html }}
        />
      </div>
    </div>
  )
}

function PptxRenderer({ url }: { url: string }) {
  const { buf, state } = useFetchBuffer(url)
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderState, setRenderState] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle')
  const [slideCount, setSlideCount] = useState(0)

  useEffect(() => {
    if (state !== 'done' || !buf || !containerRef.current) return
    setRenderState('rendering')
    const el = containerRef.current
    el.innerHTML = ''
    import('pptx-preview')
      .then(({ init }) => {
        const previewer = init(el, { width: 960, height: 540, mode: 'slide' })
        return previewer.preview(buf).then(() => {
          // Force-center rendered wrapper/slides regardless of library defaults.
          el.style.display = 'flex'
          el.style.flexDirection = 'column'
          el.style.alignItems = 'center'
          Array.from(el.children).forEach((child) => {
            if (child instanceof HTMLElement) {
              child.style.marginLeft = 'auto'
              child.style.marginRight = 'auto'
            }
          })
          return previewer.slideCount
        })
      })
      .then((count) => {
        setSlideCount(count as number)
        setRenderState('done')
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[DocumentPreview] PptxRenderer 渲染失败', { url, error: err, message: msg })
        setRenderState('error')
      })
  }, [buf, state, url])

  return (
    <div className="relative flex flex-col flex-1 overflow-y-auto bg-[#1e1e24]
      [scrollbar-width:thin] [scrollbar-color:#4a4a5a_transparent]
      [&::-webkit-scrollbar]:w-2
      [&::-webkit-scrollbar-track]:bg-transparent
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb]:bg-[#4a4a5a]
      [&::-webkit-scrollbar-thumb:hover]:bg-[#6a6a7a]"
    >
      {(state === 'loading' || renderState === 'rendering') && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Loading label="渲染 PPT 幻灯片…" />
        </div>
      )}
      {(state === 'error' || renderState === 'error') && <FetchError />}
      {renderState === 'done' && slideCount > 0 && (
        <div className="py-2 text-center text-xs text-white/30">{slideCount} 张幻灯片</div>
      )}
      {/* 幻灯片居中容器 */}
      <div className="flex flex-col items-center gap-4 px-4 pb-8 pt-4">
        <div
          ref={containerRef}
          className="w-full max-w-[960px] [&>*]:rounded-lg [&>*]:overflow-hidden [&>*]:shadow-2xl [&>*]:mb-0"
        />
      </div>
    </div>
  )
}

/* ─────────────── download fallback ─────────────── */

function DownloadFallback({ url, fileName }: { url: string; fileName: string }) {
  const ext = extOf(fileName).toUpperCase()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="flex size-24 items-center justify-center rounded-3xl bg-gradient-to-br from-neon-purple/20 to-neon-cyan/10 border border-white/[0.08]">
        <FileText className="size-12 text-neon-purple/60" />
      </div>
      <div className="text-center">
        <p className="text-base font-medium text-text-primary">{ext} 格式暂不支持在线预览</p>
        <p className="mt-1 text-sm text-text-muted">请下载后使用对应软件打开</p>
      </div>
      <div className="flex gap-3">
        <a
          href={url}
          download={fileName}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-neon-purple/20 border border-neon-purple/30 px-5 py-2.5 text-sm font-medium text-neon-purple hover:bg-neon-purple/30 transition-app"
        >
          <Download className="size-4" />
          下载文件
        </a>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white/[0.06] border border-white/[0.10] px-5 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/[0.10] transition-app"
        >
          <ExternalLink className="size-4" />
          新窗口打开
        </a>
      </div>
    </div>
  )
}
