import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import {
  Check,
  Coins,
  Copy,
  Gift,
  Link2,
  Loader2,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'

import { PageContainer, GradientHero, SectionCard, StatCard } from '@/components/shared'
import { Button } from '@/components/common/Button'
import { toast } from '@/components/common/Toast'
import { referralApi, type ReferralListItem, type ReferralOverview } from '@/api/referral'
import { cn } from '@/lib/utils'

function copyText(text: string, label: string) {
  navigator.clipboard
    ?.writeText(text)
    .then(() => toast.success(`${label}已复制`))
    .catch(() => toast.error('复制失败，请手动复制'))
}

export default function ReferralPage() {
  const { t } = useTranslation()
  const [overview, setOverview] = useState<ReferralOverview | null>(null)
  const [list, setList] = useState<ReferralListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setOverview(await referralApi.getMe())
    } catch {
      toast.error(t('referral.loadFailed', '加载邀请信息失败'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const loadList = useCallback(async () => {
    setListLoading(true)
    try {
      const res = await referralApi.list(1, 50)
      setList(res.items)
    } catch {
      /* 列表失败不打断主流程 */
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    void loadList()
  }, [load, loadList])

  const code = overview?.invitation_code ?? ''
  const inviteLink = code ? `${window.location.origin}/register?invitation_code=${code}` : ''

  const registerReward = overview?.register_reward ?? null
  const rechargeReward = overview?.recharge_reward ?? null

  return (
    <PageContainer size="md">
      <GradientHero
        tone="sunset"
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Gift className="size-3.5" strokeWidth={2.4} />
            {t('referral.title', '邀请有礼')}
          </span>
        }
        title={t('referral.heroTitle', '邀请好友注册，领取一阶与二阶奖励')}
        description={t(
          'referral.heroDesc',
          '好友通过你的专属链接注册后可领取一阶奖励；好友后续充值后，将按活动规则触发二阶充值奖励。',
        )}
      />

      {/* 邀请码 + 链接 + 二维码 */}
      <SectionCard variant="elevated" className="mt-6" bodyClassName="p-6">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            {/* 二维码 */}
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-xl border border-border bg-white p-3">
                {inviteLink ? (
                  <QRCodeSVG value={inviteLink} size={150} level="M" marginSize={1} />
                ) : (
                  <div className="size-[150px]" />
                )}
              </div>
              <p className="text-xs font-medium text-foreground">{t('referral.scanToJoin', '扫码注册自动绑定')}</p>
              <p className="text-[11px] text-muted-foreground">{t('referral.scanHint', '适合发到微信、社群或私域客户群')}</p>
            </div>

            {/* 邀请码 + 链接 */}
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">{t('referral.code', '专属邀请码')}</p>
                <div className="flex items-center gap-2">
                  <span className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-base font-semibold tracking-wider text-foreground">
                    {code || '—'}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => copyText(code, t('referral.code', '邀请码'))} disabled={!code}>
                    <Copy className="size-4" strokeWidth={2.1} />
                    {t('common.copy', '复制')}
                  </Button>
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">{t('referral.link', '邀请链接')}</p>
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs break-all text-foreground/80">
                  {inviteLink || '—'}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => copyText(inviteLink, t('referral.link', '邀请链接'))} disabled={!inviteLink}>
                    <Link2 className="size-4" strokeWidth={2.1} />
                    {t('referral.copyLink', '复制链接')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* 流程 / 奖励说明 */}
      {(registerReward || rechargeReward) && (
        <div className={cn('mt-6 grid gap-4', rechargeReward ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          <RuleCard
            icon={Link2}
            title={t('referral.step1Title', '分享专属链接')}
            desc={t('referral.step1Desc', '好友通过你的链接注册后自动绑定邀请关系')}
          />
          <RuleCard
            icon={UserPlus}
            title={t('referral.step2Title', '注册领取一阶奖励')}
            desc={
              registerReward
                ? t('referral.step2Reward', '好友完成注册即发放 {{name}}（+{{points}} 积分）', {
                    name: registerReward.name,
                    points: registerReward.points,
                  })
                : t('referral.step2Plain', '好友完成注册即可领取一阶奖励')
            }
            highlight={!!registerReward}
          />
          {rechargeReward && (
            <RuleCard
              icon={Wallet}
              title={t('referral.step3Title', '充值领取二阶奖励')}
              desc={t('referral.step3Reward', '好友首次充值后发放 {{name}}（+{{points}} 积分）', {
                name: rechargeReward.name,
                points: rechargeReward.points,
              })}
              highlight
            />
          )}
        </div>
      )}

      {/* 统计 */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StatCard title={t('referral.invitedCount', '已邀请')} value={overview?.stats.invited_count ?? 0} icon={Users} iconAccent="primary" />
        <StatCard title={t('referral.rewardedCount', '已发放奖励')} value={overview?.stats.rewarded_count ?? 0} icon={Coins} iconAccent="warning" />
      </div>

      {/* 邀请列表 */}
      <SectionCard
        title={t('referral.listTitle', '邀请列表')}
        description={t('referral.listDesc', '好友注册 / 充值后才会出现一条记录')}
        icon={Users}
        iconAccent="primary"
        className="mt-6"
        actions={
          <Button variant="outline" size="sm" onClick={() => void loadList()} disabled={listLoading}>
            {listLoading ? <Loader2 className="size-3.5 animate-spin" /> : t('common.refresh', '刷新')}
          </Button>
        }
      >
        {listLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('referral.empty', '还没有邀请记录，快分享你的链接吧')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/20 text-xs font-semibold text-amber-600 dark:text-amber-300">
                    {(it.nickname || it.identity || '友').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{it.nickname || t('referral.aFriend', '好友')}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {it.identity || '—'}
                      {it.created_at ? ` · ${new Date(it.created_at).toLocaleString('zh-CN', { hour12: false })}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {it.recharge_granted ? (
                    <Badge className="border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300">
                      <Check className="size-3" strokeWidth={2.5} />
                      {t('referral.tier2Done', '二阶奖励已发放')}
                    </Badge>
                  ) : it.register_granted ? (
                    <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                      <Check className="size-3" strokeWidth={2.5} />
                      {t('referral.tier1Done', '一阶奖励已发放')}
                    </Badge>
                  ) : (
                    <Badge className="border-border bg-muted text-muted-foreground">
                      {t('referral.registered', '已注册')}
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageContainer>
  )
}

function RuleCard({
  icon: Icon,
  title,
  desc,
  highlight,
}: {
  icon: typeof Link2
  title: string
  desc: string
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        highlight ? 'border-amber-500/30 bg-amber-500/[0.06]' : 'border-border bg-card',
      )}
    >
      <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400/20 to-orange-500/20 text-amber-600 dark:text-amber-300">
        <Icon className="size-5" strokeWidth={2.2} />
      </div>
      <p className="mt-2.5 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  )
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium', className)}>
      {children}
    </span>
  )
}
