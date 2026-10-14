import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Crown,
  KeyRound,
  Megaphone,
  Send,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

import type { NotificationType } from '@/api/notification'

export type Tone = 'emerald' | 'rose' | 'sky' | 'amber'

interface ToneClasses {
  bg: string
  text: string
}

/**
 * 静态完整 class，避免动态拼接（CLAUDE.md §5 禁止 `bg-${tone}/10` 这种）
 */
export const TONE_CLASSES: Record<Tone, ToneClasses> = {
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
  rose: { bg: 'bg-rose-500/10', text: 'text-rose-500' },
  sky: { bg: 'bg-sky-500/10', text: 'text-sky-500' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400' },
}

interface TypeMeta {
  icon: LucideIcon
  tone: Tone
}

export const TYPE_META: Record<NotificationType, TypeMeta> = {
  'content.generated': { icon: CheckCircle2, tone: 'emerald' },
  'content.generation_failed': { icon: XCircle, tone: 'rose' },
  'distribution.scheduled': { icon: Clock, tone: 'sky' },
  'distribution.published': { icon: Send, tone: 'emerald' },
  'distribution.failed': { icon: AlertCircle, tone: 'rose' },
  'subscription.expiring_soon': { icon: Crown, tone: 'amber' },
  'subscription.expired': { icon: Crown, tone: 'rose' },
  'account.expiring_soon': { icon: KeyRound, tone: 'amber' },
  'admin.broadcast': { icon: Megaphone, tone: 'sky' },
  'order.transfer_approved': { icon: CheckCircle2, tone: 'emerald' },
  'order.transfer_rejected': { icon: XCircle, tone: 'rose' },
  'invoice.issued': { icon: CheckCircle2, tone: 'emerald' },
  'invoice.rejected': { icon: XCircle, tone: 'rose' },
}

export function getTypeMeta(type: string): TypeMeta {
  return TYPE_META[type as NotificationType] ?? { icon: CheckCircle2, tone: 'sky' }
}
