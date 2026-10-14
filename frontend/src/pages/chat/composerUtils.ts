import type { Ability } from './abilities'
import { FAST_MODE_PROMPT_PREFIX } from './abilities'
import type { ChatMode } from './abilities'
import type { ReferenceConfig } from '@/types/generation'

export type SelectedReference =
  | { kind: 'document'; id: string; title: string; fileType?: string }
  | { kind: 'image'; id: string; url: string; title?: string }
  | { kind: 'brand'; id: string; name: string }
  | { kind: 'product'; id: string; name: string; brandName?: string }
  | { kind: 'company'; id: string; name: string }
  | { kind: 'customer'; id: string; name: string }
  | { kind: 'case'; id: string; title: string }

export function refKey(r: SelectedReference): string {
  return `${r.kind}:${r.id}`
}

export const MAX_REFS = 8

/**
 * 构造发给后端的消息正文：仅处理「能力」与「快速模式」前缀。
 *
 * 文档/图片/品牌/产品等参考素材不再拼进正文，改由结构化 `references`
 * 字段传给后端（见 {@link toReferencePayload}），后端负责注入文档全文 /
 * 多模态图片 / 品牌产品资料，user 消息 content 保持纯净。
 */
export function buildMessageText(
  text: string,
  ability: Ability | null,
  mode: ChatMode = 'agent',
): string {
  let body = text
  if (mode === 'fast') {
    body = `${FAST_MODE_PROMPT_PREFIX}${text}`
  }
  if (ability) {
    body = `[能力]：${ability.label}\n\n${body}`
  }
  return body
}

/**
 * 把选中的参考素材转成发给后端的结构化数组（后端按 kind+id 重新查询权威数据）。
 * 直接透传 SelectedReference（含 kind/id 及展示字段），后端只取 kind+id，忽略多余字段。
 */
export function toReferencePayload(refs: SelectedReference[]): SelectedReference[] {
  return refs
}

/** 把参考素材按维度收集 ID（图片不计入——它单独作参考图）。 */
export function refsToIds(refs: SelectedReference[]): Omit<ReferenceConfig, 'mode'> {
  const idsOf = (kind: SelectedReference['kind']) =>
    refs.filter((r) => r.kind === kind).map((r) => r.id)
  return {
    company_ids: idsOf('company'),
    brand_ids: idsOf('brand'),
    product_ids: idsOf('product'),
    customer_ids: idsOf('customer'),
    case_ids: idsOf('case'),
    document_ids: idsOf('document'),
  }
}

/**
 * 快速模式：把挂载的参考素材映射为生成接口的 `reference` 配置。
 * 挂载了文本维度（公司/品牌/产品/客户/案例/文档）→ custom；什么都没挂 → none。
 */
export function toReferenceConfig(refs: SelectedReference[]): ReferenceConfig {
  const ids = refsToIds(refs)
  const hasAny = Object.values(ids).some((arr) => arr.length > 0)
  return hasAny ? { mode: 'custom', ...ids } : { mode: 'none' }
}

/**
 * 由 `reference` 配置（仅 ID）反推参考素材列表（占位标签），用于回填选择弹窗的勾选态。
 * 标签为占位值（真实名称在用户进入对应 Tab 加载后显示）；ID 得以保留，避免编辑时丢失。
 */
export function configToRefs(c: ReferenceConfig | undefined): SelectedReference[] {
  if (!c) return []
  const out: SelectedReference[] = []
  for (const id of c.company_ids ?? []) out.push({ kind: 'company', id, name: '已选公司' })
  for (const id of c.brand_ids ?? []) out.push({ kind: 'brand', id, name: '已选品牌' })
  for (const id of c.product_ids ?? []) out.push({ kind: 'product', id, name: '已选产品' })
  for (const id of c.customer_ids ?? []) out.push({ kind: 'customer', id, name: '已选客户' })
  for (const id of c.case_ids ?? []) out.push({ kind: 'case', id, title: '已选案例' })
  for (const id of c.document_ids ?? []) out.push({ kind: 'document', id, title: '已选文档' })
  return out
}

/** 参考素材气泡卡片的展示结构（与后端 attachments 中的 display_refs 对齐）。 */
export type ReferenceChip = {
  kind: 'document' | 'image' | 'brand' | 'product' | 'company' | 'customer' | 'case'
  id: string
  title?: string
  name?: string
  /** 图片缩略图 URL（卡片展示） */
  url?: string
  /** 图片原图 URL（点开 MediaPreview 用，缺省回退 url） */
  fullUrl?: string
  /** 文档类型（pdf/docx/xlsx…），传给 DocumentPreview 以正确判定格式 */
  fileType?: string
  brandName?: string
}

/**
 * 由选中的参考素材生成乐观渲染用的展示数组，结构与后端持久化的
 * attachments 一致，保证发送瞬间的气泡卡片与刷新后一致。
 */
export function toDisplayRefs(refs: SelectedReference[]): ReferenceChip[] {
  return refs.map((r) => {
    switch (r.kind) {
      case 'document':
        return { kind: r.kind, id: r.id, title: r.title, fileType: r.fileType }
      case 'image':
        // ReferenceDialog.imageUrl() 返回的是全尺寸 file_url，缩略图与原图同源即可
        return { kind: r.kind, id: r.id, title: r.title, url: r.url, fullUrl: r.url }
      case 'brand':
        return { kind: r.kind, id: r.id, name: r.name }
      case 'product':
        return { kind: r.kind, id: r.id, name: r.name, brandName: r.brandName }
      case 'company':
      case 'customer':
        return { kind: r.kind, id: r.id, name: r.name }
      case 'case':
        return { kind: r.kind, id: r.id, title: r.title }
    }
  })
}
