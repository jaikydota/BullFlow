import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { Loader2, FileText } from 'lucide-react'

import MarkDown2 from '@/components/markdown2'

/**
 * 协议 / 隐私政策的独立全屏阅读页（公开，无需登录）。
 * 通过 /legal/agreement 与 /legal/privacy 在新标签页打开。
 * 中文用户读 .zh.md，其余语言一律读 .en.md。
 */
const DOC_FILES: Record<string, string> = {
  agreement: 'user-agreement',
  privacy: 'privacy-policy',
}

export default function LegalPage() {
  const { doc } = useParams<{ doc: string }>()
  const { t, i18n } = useTranslation()

  const lang = i18n.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  const base = doc ? DOC_FILES[doc] : undefined
  const url = base ? `/legal/${base}.${lang}.md` : null

  // 结果按 url 归属，loading/error 由派生量计算，避免在 effect 内同步 setState
  const [loaded, setLoaded] = useState<{ url: string; text: string } | null>(null)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  const docTitle =
    doc === 'privacy' ? t('auth.privacyPolicy') : t('auth.userAgreement')

  useEffect(() => {
    if (!url) return
    let cancelled = false
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const txt = await r.text()
        if (!cancelled) setLoaded({ url, text: txt })
      })
      .catch((err: unknown) => {
        console.error('[LegalPage] 加载协议失败', { url, err })
        if (!cancelled) setFailedUrl(url)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  const text = loaded?.url === url ? loaded.text : null
  const errored = !url || failedUrl === url
  const loading = !errored && text === null

  // 阅读页标题 → 浏览器标签
  useEffect(() => {
    const prev = document.title
    document.title = `${docTitle} · 推量牛`
    return () => {
      document.title = prev
    }
  }, [docTitle])

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-background">
      {/* 顶部条 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card/80 px-5 py-3 backdrop-blur-md sm:px-8">
        <img src="/logo.png" alt="推量牛" className="size-8 object-contain" draggable={false} />
        <span className="text-base font-semibold tracking-tight">推量牛</span>
        <span className="text-border">/</span>
        <span className="text-sm text-muted-foreground">{docTitle}</span>
      </header>

      {/* 正文 */}
      <main className="flex min-h-0 flex-1 overflow-y-auto bg-white">
        {loading && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        )}
        {errored && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <FileText className="size-12 opacity-40" />
            <p className="text-sm">{t('common.failed')}</p>
          </div>
        )}
        {!loading && !errored && text !== null && (
          <div className="mx-auto w-full max-w-4xl px-6 py-10 sm:px-10">
            <MarkDown2 content={text} autoScroll={false} theme="light" />
          </div>
        )}
      </main>
    </div>
  )
}
