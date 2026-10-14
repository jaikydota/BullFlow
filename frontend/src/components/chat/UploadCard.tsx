import { useState, useEffect } from 'react'
import {
  FileText, FileSpreadsheet, FileImage, Film, Mic,
  File as FileIcon, ZoomIn, Play, Headphones, Loader2, Trash2,
} from 'lucide-react'
import { DocumentPreviewModal } from '@/components/common/DocumentPreview'
import { MediaPreview } from '@/components/common/MediaPreview'
import type { UploadResult } from '@/types/chat'
import { ApiError } from '@/types/api'
import { imagesApi } from '@/api/images'
import { videosApi } from '@/api/videos'
import { audiosApi } from '@/api/audios'
import { documentsApi } from '@/api/documents'

// ─── 文档图标映射 ─────────────────────────────────────────────────
function getDocIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return <FileText className="w-6 h-6 text-destructive" />
  if (['doc', 'docx'].includes(ext)) return <FileText className="w-6 h-6 text-sky-600 dark:text-sky-400" />
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet className="w-6 h-6 text-green-600" />
  if (['ppt', 'pptx'].includes(ext)) return <FileImage className="w-6 h-6 text-orange-500" />
  return <FileIcon className="w-6 h-6 text-muted-foreground/70" />
}

// ─── 分类描述 ─────────────────────────────────────────────────────
const CATEGORY_LABEL: Record<string, string> = {
  document: '已加入知识库',
  image: '图片已上传',
  video: '视频已上传',
  audio: '音频已上传',
}
const CATEGORY_PROCESSING_LABEL: Record<string, string> = {
  document: '知识库处理中',
  image: '图片处理中',
  video: '视频处理中',
  audio: '音频处理中',
}

const POLL_INTERVAL = 3000

// ─── 主组件 ──────────────────────────────────────────────────────
interface Props {
  result: UploadResult
}

export default function UploadCard({ result }: Props) {
  const [showDocPreview, setShowDocPreview] = useState(false)
  const [showMediaPreview, setShowMediaPreview] = useState(false)
  const [liveStatus, setLiveStatus] = useState(result.status)
  const [liveThumbnailUrl, setLiveThumbnailUrl] = useState<string | undefined>(
    result.thumbnail_url ?? undefined,
  )

  const { file_category, file_name, file_url } = result

  const isProcessing = liveStatus === 'pending' || liveStatus === 'processing'
  const isCompleted = liveStatus === 'completed'
  const isFailed = liveStatus === 'failed'
  const isDeleted = liveStatus === 'deleted'
  const isMedia = file_category === 'image' || file_category === 'video' || file_category === 'audio'
  const mediaType = file_category as 'image' | 'video' | 'audio'

  // ─── 轮询：pending/processing 时每 3s 查一次真实状态 ───────────
  useEffect(() => {
    if (!isProcessing) return

    const poll = async () => {
      try {
        let data: any
        if (file_category === 'image') {
          data = await imagesApi.get(result.file_id)
          if (data?.thumbnail_path) setLiveThumbnailUrl(data.thumbnail_path)
        } else if (file_category === 'video') {
          data = await videosApi.get(result.file_id)
          if (data?.cover_path) setLiveThumbnailUrl(data.cover_path)
        } else if (file_category === 'audio') {
          data = await audiosApi.get(result.file_id)
        } else {
          data = await documentsApi.get(result.file_id)
        }
        if (data?.status) setLiveStatus(data.status)
      } catch (err) {
        // 404 表示文件已被删除，停止轮询并标记
        if (err instanceof ApiError && err.code === 40400) {
          setLiveStatus('deleted')
        }
        // 其他网络错误静默忽略，等下一轮重试
      }
    }

    const timer = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [result.file_id, file_category, isProcessing])

  return (
    <>
      <div className="mt-2 rounded-xl border border-border bg-muted/40 px-4 py-3 flex items-center gap-3">
        {/* 文件图标 / 缩略图 */}
        <div className="flex-shrink-0">
          {file_category === 'image' && liveThumbnailUrl ? (
            <img
              src={liveThumbnailUrl}
              alt={file_name}
              className="w-12 h-12 rounded-lg object-cover"
            />
          ) : file_category === 'image' ? (
            <div className="w-12 h-12 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <FileImage className="w-6 h-6 text-sky-500" />
            </div>
          ) : file_category === 'video' ? (
            <div className="w-12 h-12 rounded-lg bg-purple-50 flex items-center justify-center relative overflow-hidden">
              {liveThumbnailUrl ? (
                <img src={liveThumbnailUrl} alt={file_name} className="w-full h-full object-cover" />
              ) : (
                <Film className="w-6 h-6 text-purple-400" />
              )}
            </div>
          ) : file_category === 'audio' ? (
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-neon-purple/20 to-neon-pink/20 flex items-center justify-center">
              <Mic className="w-6 h-6 text-purple-500" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-lg bg-muted/60 flex items-center justify-center">
              {getDocIcon(file_name)}
            </div>
          )}
        </div>

        {/* 文件信息 */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate" title={file_name}>
            {file_name}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {isDeleted
              ? '文件已删除'
              : isProcessing
                ? CATEGORY_PROCESSING_LABEL[file_category] ?? '处理中'
                : isFailed
                  ? (CATEGORY_LABEL[file_category] ?? '已上传') + ' · 处理失败'
                  : CATEGORY_LABEL[file_category] ?? '已上传'}
          </p>
        </div>

        {/* 状态标签 */}
        {isDeleted ? (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground/70 font-medium whitespace-nowrap">
            <Trash2 className="w-3 h-3" />
            已删除
          </span>
        ) : isProcessing ? (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium whitespace-nowrap">
            <Loader2 className="w-3 h-3 animate-spin" />
            处理中
          </span>
        ) : isCompleted ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium whitespace-nowrap">
            已完成
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-destructive font-medium whitespace-nowrap">
            失败
          </span>
        )}

        {/* 预览按钮（仅 completed 可预览） */}
        {isCompleted && (
          <>
            {file_category === 'document' && (
              <button
                type="button"
                onClick={() => setShowDocPreview(true)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/15 cursor-pointer font-medium transition-colors whitespace-nowrap"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                预览
              </button>
            )}
            {file_category === 'image' && (
              <button
                type="button"
                onClick={() => setShowMediaPreview(true)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/15 cursor-pointer font-medium transition-colors whitespace-nowrap"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                查看
              </button>
            )}
            {file_category === 'video' && (
              <button
                type="button"
                onClick={() => setShowMediaPreview(true)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 cursor-pointer font-medium transition-colors whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                播放
              </button>
            )}
            {file_category === 'audio' && (
              <button
                type="button"
                onClick={() => setShowMediaPreview(true)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 cursor-pointer font-medium transition-colors whitespace-nowrap"
              >
                <Headphones className="w-3.5 h-3.5" />
                播放
              </button>
            )}
          </>
        )}
      </div>

      {/* 文档预览 */}
      {showDocPreview && (
        <DocumentPreviewModal
          url={file_url}
          fileName={file_name}
          onClose={() => setShowDocPreview(false)}
        />
      )}

      {/* 图片 / 视频 / 音频预览 —— 复用 MediaPreview */}
      {showMediaPreview && isMedia && (
        <MediaPreview
          url={file_url}
          type={mediaType}
          alt={file_name}
          onClose={() => setShowMediaPreview(false)}
        />
      )}
    </>
  )
}
