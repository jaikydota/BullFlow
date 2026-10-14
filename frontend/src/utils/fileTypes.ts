/**
 * 文件类型元数据：图标 / 颜色 / 徽章样式
 *
 * 规范：icon 与 badgeClass 颜色一一对应，全系统复用（DocumentListPage、DocumentPreview 等）。
 * 如需新增格式，在 FILE_TYPE_MAP 增加条目即可，无需修改各页面。
 */
import type { LucideIcon } from 'lucide-react'
import {
  AlignLeft,
  BookOpen,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Globe,
  Hash,
  Presentation,
  Table,
} from 'lucide-react'

export type FileTypeMeta = {
  icon: LucideIcon
  /** Tailwind text-* 颜色类，用于图标 */
  iconClass: string
  /** badge 整体样式（bg + text + border），配合 `.badge` 基础类使用 */
  badgeClass: string
  /** 简短人类可读标签 */
  label: string
}

export const FILE_TYPE_MAP: Record<string, FileTypeMeta> = {
  // ─── 文档 ───────────────────────────────────────────────────────────────
  pdf:      { icon: FileText,        iconClass: 'text-red-400',      badgeClass: 'bg-red-500/10 text-red-400 border-red-500/20',             label: 'PDF'   },
  docx:     { icon: FileText,        iconClass: 'text-blue-400',     badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20',          label: 'Word'  },
  doc:      { icon: FileText,        iconClass: 'text-blue-400',     badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20',          label: 'Word'  },
  // ─── 表格 ───────────────────────────────────────────────────────────────
  xlsx:     { icon: FileSpreadsheet, iconClass: 'text-emerald-400',  badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Excel' },
  xls:      { icon: FileSpreadsheet, iconClass: 'text-emerald-400',  badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Excel' },
  csv:      { icon: Table,           iconClass: 'text-cyan-400',     badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',          label: 'CSV'   },
  // ─── 演示 ───────────────────────────────────────────────────────────────
  pptx:     { icon: Presentation,    iconClass: 'text-orange-400',   badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/20',    label: 'PPT'   },
  ppt:      { icon: Presentation,    iconClass: 'text-orange-400',   badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/20',    label: 'PPT'   },
  // ─── 标记语言 ────────────────────────────────────────────────────────────
  md:       { icon: Hash,            iconClass: 'text-violet-400',   badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20',    label: 'MD'    },
  markdown: { icon: Hash,            iconClass: 'text-violet-400',   badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20',    label: 'MD'    },
  html:     { icon: Globe,           iconClass: 'text-amber-400',    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',       label: 'HTML'  },
  htm:      { icon: Globe,           iconClass: 'text-amber-400',    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',       label: 'HTML'  },
  // ─── 纯文本 ─────────────────────────────────────────────────────────────
  txt:      { icon: AlignLeft,       iconClass: 'text-slate-400',    badgeClass: 'bg-white/[0.06] text-slate-400 border-white/[0.10]',       label: 'TXT'   },
  rtf:      { icon: FileText,        iconClass: 'text-sky-400',      badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/20',             label: 'RTF'   },
  // ─── 电子书 / 开放文档 ───────────────────────────────────────────────────
  epub:     { icon: BookOpen,        iconClass: 'text-purple-400',   badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20',    label: 'ePub'  },
  odt:      { icon: FileText,        iconClass: 'text-indigo-400',   badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',    label: 'ODT'   },
  // ─── 代码 / 数据 ─────────────────────────────────────────────────────────
  json:     { icon: FileCode2,       iconClass: 'text-yellow-400',   badgeClass: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',    label: 'JSON'  },
  xml:      { icon: FileCode2,       iconClass: 'text-lime-400',     badgeClass: 'bg-lime-500/10 text-lime-400 border-lime-500/20',          label: 'XML'   },
}

export const FILE_TYPE_FALLBACK: FileTypeMeta = {
  icon: FileText,
  iconClass: 'text-text-muted',
  badgeClass: 'bg-white/[0.06] text-text-muted border-white/[0.10]',
  label: '文件',
}

/** 根据扩展名（含或不含点）获取文件类型元数据 */
export function getFileMeta(fileTypeOrExt: string): FileTypeMeta {
  const key = fileTypeOrExt.toLowerCase().replace(/^\./, '')
  return FILE_TYPE_MAP[key] ?? FILE_TYPE_FALLBACK
}

/** 从完整文件名提取小写扩展名，例如 "report.docx" → "docx" */
export function extOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}
