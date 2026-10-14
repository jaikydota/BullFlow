import { useEffect, useState } from 'react'

import { DocumentPreviewModal } from '@/components/common/DocumentPreview'

interface ArticlePreviewModalProps {
  content: string
  title: string
  onClose: () => void
}

/**
 * 文章内容预览弹窗。
 * 把文章正文（Markdown / 纯文本）包装成 Blob URL，复用 DocumentPreviewModal。
 * 文件类型固定为 md，渲染富文本预览（含标题、列表、代码块等）而非纯文本。
 */
export function ArticlePreviewModal({ content, title, onClose }: ArticlePreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [content])

  if (!blobUrl) return null
  return (
    <DocumentPreviewModal
      url={blobUrl}
      fileName="article.md"
      fileType="md"
      title={title}
      onClose={onClose}
    />
  )
}
