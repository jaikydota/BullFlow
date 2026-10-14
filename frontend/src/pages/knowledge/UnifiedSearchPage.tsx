import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  Image as ImageIcon,
  Mic,
  Search,
  Video,
  Loader2,
  BookOpen,
  ExternalLink,
} from 'lucide-react'
import { searchApi } from '@/api/search'
import type {
  UnifiedDocResult,
  UnifiedImageResult,
  UnifiedAudioResult,
  UnifiedVideoResult,
} from '@/api/search'
import { Button } from '@/components/common/Button'
import { Badge } from '@/components/common/Badge'
import { MediaPreview } from '@/components/common/MediaPreview'
import { DocumentPreviewModal } from '@/components/common/DocumentPreview'
import { toast } from '@/components/common/Toast'
import { documentsApi } from '@/api/documents'
import { PageHeader } from '@/components/shared'
import { formatDate } from '@/utils/format'

type Tab = 'all' | 'documents' | 'images' | 'audios' | 'videos'

type DocPreviewState = { url: string; fileName: string; fileType?: string; title: string } | null
type MediaPreviewState = { url: string; type: 'image' | 'video' | 'audio'; label: string; coverUrl?: string } | null

export default function UnifiedSearchPage() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [tab, setTab] = useState<Tab>('all')

  const [documents, setDocuments] = useState<UnifiedDocResult[]>([])
  const [images, setImages] = useState<UnifiedImageResult[]>([])
  const [audios, setAudios] = useState<UnifiedAudioResult[]>([])
  const [videos, setVideos] = useState<UnifiedVideoResult[]>([])

  const [docPreview, setDocPreview] = useState<DocPreviewState>(null)
  const [mediaPreview, setMediaPreview] = useState<MediaPreviewState>(null)

  const handleSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setSearched(false)
    try {
      const res = await searchApi.unified({ query: q, top_k: 10 })
      setDocuments(res.documents)
      setImages(res.images)
      setAudios(res.audios)
      setVideos(res.videos)
      setSearched(true)
      setTab('all')
    } catch {
      toast.error('查找失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const openDocPreview = async (docId: string, title: string, fileName: string, fileType?: string) => {
    try {
      const res = await documentsApi.download(docId)
      setDocPreview({ url: res.url, fileName, fileType, title })
    } catch {
      toast.error('无法加载文档预览')
    }
  }

  const totalCount = documents.length + images.length + audios.length + videos.length

  const tabs: { key: Tab; label: string; icon: typeof FileText; count: number }[] = [
    { key: 'all', label: '全部', icon: Search, count: totalCount },
    { key: 'documents', label: '文档', icon: FileText, count: documents.length },
    { key: 'images', label: '图片', icon: ImageIcon, count: images.length },
    { key: 'audios', label: '音频', icon: Mic, count: audios.length },
    { key: 'videos', label: '视频', icon: Video, count: videos.length },
  ]

  const showDocs = tab === 'all' || tab === 'documents'
  const showImages = tab === 'all' || tab === 'images'
  const showAudios = tab === 'all' || tab === 'audios'
  const showVideos = tab === 'all' || tab === 'videos'

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* 页头 */}
      <div className="shrink-0 pb-5">
        <PageHeader
          title="知识查找"
          description="跨文档、图片、音频、视频的全库语义检索"
          icon={Search}
          iconAccent="primary"
          breadcrumbs={[{ label: '资产管理' }, { label: '知识检索' }, { label: '知识查找' }]}
        />

        {/* 搜索框 */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入关键词或语义描述，按 Enter 搜索…"
              className="w-full rounded-xl border border-border bg-muted/40 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-neon-cyan/50 focus:bg-muted focus:outline-none transition-app"
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="shrink-0"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            <span>{loading ? '搜索中…' : '搜索'}</span>
          </Button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-4">
        {/* 未搜索状态 */}
        {!searched && !loading && (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <BookOpen className="mx-auto mb-4 size-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">输入关键词开始查找</p>
              <p className="mt-1 text-xs text-muted-foreground/70">支持文档语义检索、图片语义识别、音频转录搜索、视频标题匹配</p>
            </div>
          </div>
        )}

        {/* 搜索中 */}
        {loading && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="text-sm">正在搜索全库资源…</span>
            </div>
          </div>
        )}

        {/* 结果 */}
        {searched && !loading && (
          <div className="space-y-4">
            {/* Tab 栏 */}
            <div className="flex items-center gap-1 border-b border-border pb-3">
              {tabs.map(({ key, label, icon: Icon, count }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-app cursor-pointer focus-visible:outline-none ${
                    tab === key
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="size-3.5" />
                  {label}
                  {count > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${tab === key ? 'bg-neon-cyan/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* 无结果 */}
            {totalCount === 0 && (
              <div className="py-16 text-center text-muted-foreground">
                <Search className="mx-auto mb-3 size-10 opacity-20" />
                <p className="text-sm">未找到与「{query}」相关的内容</p>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {/* 文档结果 */}
              {showDocs && documents.length > 0 && (
                <motion.section key="docs" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <SectionHeader icon={FileText} label="文档" count={documents.length} />
                  <div className="mt-2 space-y-2">
                    {documents.map(doc => (
                      <DocResultCard
                        key={doc.chunk_id}
                        doc={doc}
                        onPreview={() => openDocPreview(doc.id, doc.title, doc.file_name || doc.title, doc.file_type || undefined)}
                      />
                    ))}
                  </div>
                </motion.section>
              )}

              {/* 图片结果 */}
              {showImages && images.length > 0 && (
                <motion.section key="images" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <SectionHeader icon={ImageIcon} label="图片" count={images.length} />
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {images.map(img => (
                      <ImageResultCard
                        key={img.id}
                        img={img}
                        onPreview={() => setMediaPreview({ url: img.url, type: 'image', label: img.title })}
                      />
                    ))}
                  </div>
                </motion.section>
              )}

              {/* 音频结果 */}
              {showAudios && audios.length > 0 && (
                <motion.section key="audios" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <SectionHeader icon={Mic} label="音频" count={audios.length} />
                  <div className="mt-2 space-y-2">
                    {audios.map(audio => (
                      <AudioResultCard
                        key={audio.id}
                        audio={audio}
                        onPreview={() => setMediaPreview({ url: audio.url, type: 'audio', label: audio.title })}
                      />
                    ))}
                  </div>
                </motion.section>
              )}

              {/* 视频结果 */}
              {showVideos && videos.length > 0 && (
                <motion.section key="videos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <SectionHeader icon={Video} label="视频" count={videos.length} />
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {videos.map(video => (
                      <VideoResultCard
                        key={video.id}
                        video={video}
                        onPreview={() => setMediaPreview({ url: video.url, type: 'video', label: video.title, coverUrl: video.cover_url ?? undefined })}
                      />
                    ))}
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* 文档预览 */}
      {docPreview && (
        <DocumentPreviewModal
          url={docPreview.url}
          fileName={docPreview.fileName}
          fileType={docPreview.fileType}
          title={docPreview.title}
          onClose={() => setDocPreview(null)}
        />
      )}

      {/* 媒体预览 */}
      {mediaPreview && (
        <MediaPreview
          url={mediaPreview.url}
          type={mediaPreview.type}
          alt={mediaPreview.label}
          coverUrl={mediaPreview.coverUrl}
          onClose={() => setMediaPreview(null)}
        />
      )}
    </div>
  )
}

/* ── 小型子组件 ── */

function SectionHeader({ icon: Icon, label, count }: { icon: typeof FileText; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
      <Icon className="size-3.5 text-primary/60" />
      <span>{label}</span>
      <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground/70">{count}</span>
      <div className="flex-1 h-px bg-muted" />
    </div>
  )
}

function ScoreBadge({ score, source }: { score: number; source?: string }) {
  const pct = Math.round(score * 100)
  const color = pct >= 60 ? 'green' : pct >= 35 ? 'cyan' : 'muted'
  return (
    <div className="flex items-center gap-1.5">
      <Badge color={color} className="text-[10px] px-1.5 py-0.5">{pct}%</Badge>
      {source && source !== 'reranker' && (
        <span className="text-[10px] text-muted-foreground/70">{source}</span>
      )}
    </div>
  )
}

function DocResultCard({ doc, onPreview }: { doc: UnifiedDocResult; onPreview: () => void }) {
  const highlight = doc.highlight_content?.[0]
  return (
    <button
      type="button"
      onClick={onPreview}
      className="w-full rounded-xl border border-border bg-card px-4 py-3 text-left transition-app hover:border-neon-cyan/20 hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <FileText className="mt-0.5 size-4 shrink-0 text-primary/60" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{doc.title || '无标题文档'}</p>
            {highlight ? (
              <p
                className="mt-1 line-clamp-2 text-xs text-muted-foreground leading-relaxed"
                dangerouslySetInnerHTML={{ __html: highlight }}
              />
            ) : (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground leading-relaxed">{doc.content}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ScoreBadge score={doc.score} source={doc.source} />
          <ExternalLink className="size-3.5 text-muted-foreground/70" />
        </div>
      </div>
    </button>
  )
}

function ImageResultCard({ img, onPreview }: { img: UnifiedImageResult; onPreview: () => void }) {
  return (
    <button
      type="button"
      onClick={onPreview}
      className="group relative overflow-hidden rounded-xl border border-border bg-card cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/30 transition-app hover:border-neon-cyan/20"
    >
      <div className="aspect-square overflow-hidden">
        <img
          src={img.url}
          alt={img.title}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      </div>
      <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/70 via-transparent to-transparent p-2.5 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="flex justify-end">
          <ScoreBadge score={img.score} />
        </div>
        <p className="truncate text-xs font-medium text-white">{img.title || '无标题'}</p>
      </div>
    </button>
  )
}

function AudioResultCard({ audio, onPreview }: { audio: UnifiedAudioResult; onPreview: () => void }) {
  return (
    <button
      type="button"
      onClick={onPreview}
      className="w-full rounded-xl border border-border bg-card px-4 py-3 text-left transition-app hover:border-neon-cyan/20 hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/30"
    >
      <div className="flex items-start gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
          <Mic className="size-4 text-violet-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{audio.title || '无标题音频'}</p>
          {audio.snippet ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground leading-relaxed">…{audio.snippet}…</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground/70">{formatDate(audio.created_at)}</p>
          )}
        </div>
        <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
      </div>
    </button>
  )
}

function VideoResultCard({ video, onPreview }: { video: UnifiedVideoResult; onPreview: () => void }) {
  return (
    <button
      type="button"
      onClick={onPreview}
      className="group relative overflow-hidden rounded-xl border border-border bg-card cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/30 transition-app hover:border-neon-cyan/20"
    >
      <div className="aspect-video overflow-hidden bg-black/30">
        {video.cover_url ? (
          <img
            src={video.cover_url}
            alt={video.title}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Video className="size-8 text-white/20" />
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="truncate text-xs font-medium text-foreground">{video.title || '无标题视频'}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground/70">{formatDate(video.created_at)}</p>
      </div>
    </button>
  )
}
