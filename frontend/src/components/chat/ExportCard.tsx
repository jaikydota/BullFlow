import type { ExportResult } from '@/types/chat'
import { toast } from '@/components/common/Toast'
import { downloadFile } from '@/utils/download'

const FORMAT_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  pdf:  { icon: '📄', label: 'PDF',  color: 'text-rose-600 dark:text-rose-400' },
  docx: { icon: '📝', label: 'Word', color: 'text-sky-600 dark:text-sky-400' },
}

interface Props {
  result: ExportResult
}

export default function ExportCard({ result }: Props) {
  const config = FORMAT_CONFIG[result.format] ?? { icon: '📁', label: result.format.toUpperCase(), color: 'text-foreground/70' }

  return (
    <div className="mt-2 rounded-xl border border-border bg-muted/40 px-4 py-3 flex items-center gap-3">
      {/* Format icon */}
      <span className={`text-2xl ${config.color}`}>{config.icon}</span>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {result.title || '导出文件'}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-0.5">
          {config.label} 格式
        </p>
      </div>

      {/* Download button —— 跨域 URL <a download> 会失效；用 JS fetch+Blob 强制下载 */}
      <button
        type="button"
        onClick={async () => {
          try {
            const base = (result.title || '导出文件').replace(/[\\/:*?"<>|]/g, '_')
            await downloadFile(result.download_url, `${base}.${result.format}`)
          } catch (e) {
            console.error('[ExportCard] download failed', e)
            toast.error('下载失败，请检查网络或稍后重试')
          }
        }}
        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/15 cursor-pointer font-medium transition-colors whitespace-nowrap"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        下载
      </button>
    </div>
  )
}
