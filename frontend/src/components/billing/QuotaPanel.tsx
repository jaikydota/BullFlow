import { Cloud, Coins, Globe2, Sparkles, Users } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { Subscription } from '@/types/subscription'

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)}MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(2)}GB`
}

function ProgressBar({ percent }: { percent: number }) {
  const safe = Math.max(0, Math.min(100, percent))
  const color =
    safe >= 90
      ? 'bg-rose-500'
      : safe >= 70
        ? 'bg-amber-500'
        : 'bg-gradient-to-r from-primary to-fuchsia-500'
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${safe}%` }} />
    </div>
  )
}

export function QuotaPanel({ sub }: { sub: Subscription }) {
  const addonPoints = sub.addon_points ?? 0
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <div className="card-base p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">套餐积分</p>
            <p className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-foreground">
              {sub.points.used.toLocaleString()}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                / {sub.points.quota.toLocaleString()}
              </span>
            </p>
            <ProgressBar percent={sub.points.percent} />
            <p className="mt-1 text-xs text-muted-foreground">
              剩余 {sub.points.remaining.toLocaleString()} · 订阅日重置
            </p>
          </div>
          <div className="flex size-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Coins className="size-4" strokeWidth={2.25} />
          </div>
        </div>
      </div>

      <div className="card-base p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">永久积分（增量包）</p>
            <p className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-foreground">
              {addonPoints.toLocaleString()}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">不随订阅周期清零</p>
          </div>
          <div className="flex size-9 items-center justify-center rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400">
            <Sparkles className="size-4" strokeWidth={2.25} />
          </div>
        </div>
      </div>

      <div className="card-base p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">存储空间</p>
            <p className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-foreground">
              {formatBytes(sub.storage_bytes_used)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                / {sub.storage_gb_quota}GB
              </span>
            </p>
            <ProgressBar percent={sub.storage_percent} />
            <p className="mt-1 text-xs text-muted-foreground">
              已用 {sub.storage_percent}%
              {sub.addon_storage_gb > 0 && (
                <span className="ml-1 text-primary">· 含加包 {sub.addon_storage_gb}GB</span>
              )}
            </p>
          </div>
          <div className="flex size-9 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Cloud className="size-4" strokeWidth={2.25} />
          </div>
        </div>
      </div>

      <div className="card-base p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">国内社媒账号</p>
            <p className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-foreground">
              {sub.domestic_accounts.used}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                / {sub.domestic_accounts.quota}
              </span>
            </p>
            <ProgressBar percent={sub.domestic_accounts.percent} />
            <p className="mt-1 text-xs text-muted-foreground">
              剩余 {sub.domestic_accounts.remaining} 个
              {sub.addon_domestic_accounts > 0 && (
                <span className="ml-1 text-primary">· 含加包 {sub.addon_domestic_accounts}</span>
              )}
            </p>
          </div>
          <div className="flex size-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Users className="size-4" strokeWidth={2.25} />
          </div>
        </div>
      </div>

      <div className="card-base p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">海外社媒账号</p>
            <p className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-foreground">
              {sub.overseas_accounts.used}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                / {sub.overseas_accounts.quota}
              </span>
            </p>
            <ProgressBar percent={sub.overseas_accounts.percent} />
            <p className="mt-1 text-xs text-muted-foreground">
              剩余 {sub.overseas_accounts.remaining} 个
              {sub.addon_overseas_accounts > 0 && (
                <span className="ml-1 text-primary">· 含加包 {sub.addon_overseas_accounts}</span>
              )}
            </p>
          </div>
          <div className="flex size-9 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <Globe2 className="size-4" strokeWidth={2.25} />
          </div>
        </div>
      </div>
    </div>
  )
}

