/**
 * 文章正文双模式编辑器（仅用于「支持 HTML 正文」的平台）。
 *
 * 设计：**Markdown 为单一事实存储**（value/onChange 始终是 markdown 字符串）。
 * - 富文本模式：Tiptap WYSIWYG（StarterKit + tiptap-markdown），所见即所得；
 *   onUpdate 时把编辑器内容序列化回 markdown 存入 value，外部 value 变化（自动填充 /
 *   清空 / 切换内容）再反向 setContent。两模式因此共享同一份 markdown，互切无损。
 * - Markdown 模式：源码 textarea + 实时预览（react-markdown）。
 *
 * 提交时由调用方对「支持 HTML 的平台」用 markdownToHtml(value) 转真 HTML 下发。
 */
import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import { Markdown } from 'tiptap-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  Link2,
  Table as TableIcon,
  ImagePlus,
  Images,
  Loader2,
  Undo2,
  Redo2,
} from 'lucide-react'
import { toast } from '@/components/common/Toast'
import { imagesApi } from '@/api/images'
import { ImageLibraryPicker } from '@/components/generation/ImageLibraryPicker'
import { cn } from '@/lib/utils'

interface ArticleBodyEditorProps {
  /** markdown 文本（单一事实存储） */
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  /** 隐藏图片相关按钮（上传 / 媒体库选择）——用于不支持图片的平台，如 Reddit */
  disableImages?: boolean
}

/** 富文本编辑区内容样式（与 Markdown 预览保持一致观感） */
const PROSE = cn(
  'text-sm leading-relaxed text-foreground',
  '[&_.ProseMirror]:min-h-[260px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:px-4 [&_.ProseMirror]:py-3',
  '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground/60 [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0',
  '[&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold',
  '[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_p]:mb-3',
  '[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6',
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:cursor-pointer',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em]',
  '[&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-[13px]',
  '[&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_hr]:my-4 [&_hr]:border-border',
  // 图片：Markdown 预览 + Tiptap 编辑区共用；选中态描边
  '[&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-border',
  '[&_.ProseMirror-selectednode]:outline [&_.ProseMirror-selectednode]:outline-2 [&_.ProseMirror-selectednode]:outline-primary',
  // 表格：GFM 表格边框（Markdown 预览 + Tiptap 编辑区共用）
  '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px] [&_table]:table-fixed',
  '[&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold',
  '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5',
)

function ToolbarBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // 防止点击工具栏时编辑器失焦
      onClick={onClick}
      className={cn(
        'flex size-7 cursor-pointer items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function RichToolbar({ editor, disableImages }: { editor: Editor; disableImages?: boolean }) {
  const div = 'mx-0.5 h-5 w-px bg-border'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)

  // 选图 → 上传到媒体库（图片库）→ 拿到 URL 插入编辑器
  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许连续选同一文件
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    setUploading(true)
    try {
      const img = (await imagesApi.upload(file)) as unknown as {
        title?: string | null
        file_path?: string | null
      }
      const url = img.file_path ?? ''
      if (!url) throw new Error('上传未返回图片地址')
      editor.chain().focus().setImage({ src: url, alt: img.title ?? file.name }).run()
      toast.success('图片已上传到媒体库并插入')
    } catch (err) {
      console.error(err)
      toast.error('图片上传失败')
    } finally {
      setUploading(false)
    }
  }

  const promptLink = () => {
    const prev = editor.getAttributes('link')?.href as string | undefined
    const url = window.prompt('链接地址（留空取消链接）', prev || 'https://')
    if (url === null) return
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <ToolbarBtn title="加粗" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn title="斜体" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn title="删除线" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="size-4" />
      </ToolbarBtn>
      <span className={div} />
      <ToolbarBtn title="一级标题" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn title="二级标题" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn title="三级标题" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="size-4" />
      </ToolbarBtn>
      <span className={div} />
      <ToolbarBtn title="无序列表" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn title="有序列表" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn title="引用" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn title="代码块" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <Code className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn title="分割线" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn title="链接" active={editor.isActive('link')} onClick={promptLink}>
        <Link2 className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="插入表格"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon className="size-4" />
      </ToolbarBtn>
      {/* 图片按钮组：不支持图片的平台（如 Reddit）隐藏「插入图片 / 从媒体库选择」 */}
      {!disableImages && (
        <>
          <ToolbarBtn
            title="插入图片（上传至媒体库）"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          </ToolbarBtn>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickImage}
          />
          <ToolbarBtn title="从媒体库选择图片" onClick={() => setLibraryOpen(true)}>
            <Images className="size-4" />
          </ToolbarBtn>
          <ImageLibraryPicker
            open={libraryOpen}
            max={9}
            onClose={() => setLibraryOpen(false)}
            onConfirm={(picked) => {
              picked.forEach((p) => editor.chain().focus().setImage({ src: p.url, alt: p.title ?? '' }).run())
              setLibraryOpen(false)
            }}
          />
        </>
      )}
      <span className={div} />
      <ToolbarBtn title="撤销" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn title="重做" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="size-4" />
      </ToolbarBtn>
    </div>
  )
}

/** 取编辑器当前内容的 markdown 序列化（tiptap-markdown 注入的 storage，类型未声明，运行时存在） */
function getMarkdown(ed: Editor): string {
  return (ed.storage as { markdown?: { getMarkdown?: () => string } }).markdown?.getMarkdown?.() ?? ''
}

export function ArticleBodyEditor({ value, onChange, placeholder, disableImages }: ArticleBodyEditorProps) {
  const [mode, setMode] = useState<'rich' | 'markdown'>('rich')
  // 标记「内容变更来自编辑器内部」，避免 onUpdate → value → setContent 回环
  const internalRef = useRef(false)

  const editor = useEditor({
    immediatelyRender: true,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true },
      }),
      TableKit.configure({ table: { resizable: true } }),
      Image.configure({ inline: false, allowBase64: false }),
      Markdown.configure({ html: false, breaks: true, transformPastedText: true }),
    ],
    content: value,
    editorProps: {
      attributes: { class: 'tlf-article-editor', 'data-placeholder': placeholder || '' },
    },
    onUpdate: ({ editor }) => {
      internalRef.current = true
      onChange(getMarkdown(editor))
    },
  })

  // 外部 value 变化（自动填充 / 清空 / 切换内容）反向同步进编辑器
  useEffect(() => {
    // StrictMode 开发态会双调用 effect：此时 editor 实例可能非 null 但已被销毁
    // （commandManager=null），直接访问 editor.commands 会抛 "reading 'commands' of null"。
    // 必须同时挡掉 isDestroyed；新 editor 创建后 deps 变化会再次跑本 effect 完成同步。
    if (!editor || editor.isDestroyed) return
    if (internalRef.current) {
      internalRef.current = false
      return
    }
    const current = getMarkdown(editor)
    if (value !== current) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
  }, [value, editor])

  return (
    <div className="overflow-hidden rounded-lg border bg-card focus-within:ring-2 focus-within:ring-ring/40">
      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-2 py-1.5">
        {mode === 'rich' && editor ? (
          <RichToolbar editor={editor} disableImages={disableImages} />
        ) : (
          <span className="px-1 text-xs text-muted-foreground">Markdown 源码 · 左编辑 / 右预览</span>
        )}
        <div className="inline-flex shrink-0 rounded-md border bg-card p-0.5">
          {([
            { v: 'rich' as const, label: '富文本' },
            { v: 'markdown' as const, label: 'Markdown' },
          ]).map(({ v, label }) => (
            <button
              key={v}
              type="button"
              onClick={() => setMode(v)}
              className={cn(
                'cursor-pointer rounded px-2.5 py-0.5 text-xs font-medium transition',
                mode === v ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 编辑区 */}
      {mode === 'rich' ? (
        <EditorContent editor={editor} className={PROSE} />
      ) : (
        <div className="grid gap-px bg-border md:grid-cols-2">
          <textarea
            value={value}
            onChange={(e) => {
              internalRef.current = false
              onChange(e.target.value)
            }}
            rows={14}
            placeholder={placeholder || '用 Markdown 书写：# 标题、**加粗**、- 列表、[链接](url)…'}
            className="resize-y bg-card px-4 py-3 font-mono text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
          />
          <div className={cn('max-h-[420px] overflow-y-auto bg-card px-4 py-3', PROSE)}>
            {value.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            ) : (
              <p className="text-muted-foreground">实时预览…</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
