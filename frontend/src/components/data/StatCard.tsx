import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/utils/helpers'

export type StatCardProps = {
  label: string
  value: ReactNode
  icon?: ReactNode
  iconColor?: string
  change?: string
  changePositive?: boolean
  className?: string
  index?: number
}

export function StatCard({ label, value, icon, iconColor = 'text-neon-cyan', change, changePositive, className, index = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1], delay: index * 0.05 }}
      className={cn('stat-card glass-card rounded-2xl p-4 border border-white/[0.06]', className)}
    >
      <div className="flex items-center gap-2 mb-3">
        {icon && (
          <div className={cn('flex size-8 items-center justify-center rounded-lg bg-white/[0.05]', iconColor)}>
            {icon}
          </div>
        )}
        <span className="text-xs text-text-muted truncate">{label}</span>
      </div>
      <div className="text-2xl font-bold font-[family-name:var(--font-display)] text-text-primary">
        {value}
      </div>
      {change && (
        <div className={cn('text-xs mt-1', changePositive ? 'text-neon-green' : 'text-neon-red')}>
          {change}
        </div>
      )}
    </motion.div>
  )
}
