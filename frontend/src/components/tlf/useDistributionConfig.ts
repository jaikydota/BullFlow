/**
 * 分发配置 hook —— 国内发布「选平台 + 配置发布」的分发决策部分（不含内容编辑）。
 *
 * 复用于两处：
 * - 「内容发布」`PublishPage` Step2/Step3（mode='publish'，含定时发布）
 * - 「自动生成规则」`ScheduleEditorPage` 自动分发区（mode='rule'，无定时，内容后填充）
 *
 * 持有：平台多选 / 每平台账号(池+加载+选中) / 每平台分类(选项+加载+选择) /
 *       批量设置(可见性 isPublic、原创 original、AI、定时 publish-only)。
 * 暴露派生量与 helper，并提供 serialize() 生成后端 distribute_config、hydrate() 回灌。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '@/components/common/Toast'
import { tlfApi } from '@/api/tlf'
import { getVisiblePlatforms, getPlatformName } from '@/utils/tlfPlatforms'
import {
  platformSupports,
  getKindForPlatform,
  computeAggregateSpec,
  computeUnionTagsSpec,
  categoryRequirement,
  computePerPlatformBatchExtras,
  type PublishKind,
} from '@/utils/tlfPlatformConstraints'
import type { TlfAccount, TlfCategoryNode } from '@/types/tlf'
import { ApiError } from '@/types/api'

type CatSel = { l1: TlfCategoryNode | null; l2: TlfCategoryNode | null }

export interface DistributeConfigInit {
  platforms?: string[]
  accounts?: Record<string, string[]>
  isPublic?: boolean
  original?: boolean
  ai?: boolean
  category?: Record<string, CatSel>
  redditSubreddit?: string
}

/** 后端 distribute_config 结构（extras 给后端消费；ui 仅供编辑回灌，后端忽略） */
export interface DistributeConfigPayload {
  platforms: string[]
  accounts: Record<string, string[]>
  extras: Record<string, Record<string, unknown>>
  ui: { isPublic: boolean; original: boolean; ai: boolean; category: Record<string, CatSel> }
}

export function useDistributionConfig(opts: {
  allowedKinds: PublishKind[]
  inferredKind: PublishKind
  mode: 'publish' | 'rule'
}) {
  const { allowedKinds, inferredKind, mode } = opts

  const visiblePlatforms = useMemo(() => getVisiblePlatforms(), [])

  const [platformCodes, setPlatformCodes] = useState<string[]>([])
  const [accountsByPlatform, setAccountsByPlatform] = useState<Record<string, TlfAccount[]>>({})
  const [accountsLoadingByPlatform, setAccountsLoadingByPlatform] = useState<Record<string, boolean>>({})
  // 用户「已绑定活跃账号」的平台集合（一次性拉取，用于平台选择卡标记「已绑定」）
  const [boundPlatformCodes, setBoundPlatformCodes] = useState<Set<string>>(new Set())
  const [selectedAccountIdsByPlatform, setSelectedAccountIdsByPlatform] = useState<Record<string, Set<string>>>({})

  const [categoryOptsByPlatform, setCategoryOptsByPlatform] = useState<Record<string, TlfCategoryNode[]>>({})
  const [categoryLoadingByPlatform, setCategoryLoadingByPlatform] = useState<Record<string, boolean>>({})
  const [categoryLoadErrorByPlatform, setCategoryLoadErrorByPlatform] = useState<Record<string, string>>({})
  const [categorySelByPlatform, setCategorySelByPlatform] = useState<Record<string, CatSel>>({})

  // 批量设置
  const [isPublic, setIsPublic] = useState(true)
  const [originalChecked, setOriginalChecked] = useState(false)
  const [aiChecked, setAiChecked] = useState(false)
  // Reddit 专属：发帖目标版块（选中 Reddit 时必填）
  const [redditSubreddit, setRedditSubreddit] = useState('')
  // 定时（仅 publish 模式）
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleLocal, setScheduleLocal] = useState('')

  // 回灌后待预选的账号（rule 编辑时账号池异步加载完再勾选）
  const pendingSelRef = useRef<Record<string, string[]> | null>(null)

  // ── 派生 ──
  const compatiblePlatforms = useMemo(
    () => visiblePlatforms.filter((p) => allowedKinds.some((k) => platformSupports(p.code, k))),
    [visiblePlatforms, allowedKinds],
  )
  const kindByPlatform = useMemo(() => {
    const m: Record<string, PublishKind> = {}
    for (const code of platformCodes) {
      const k = getKindForPlatform(code, allowedKinds)
      if (k) m[code] = k
    }
    return m
  }, [platformCodes, allowedKinds])

  const aggregateSpec = useMemo(
    () =>
      computeAggregateSpec(
        platformCodes
          .map((code) => ({ code, kind: kindByPlatform[code] }))
          .filter((x): x is { code: string; kind: PublishKind } => !!x.kind),
      ),
    [platformCodes, kindByPlatform],
  )
  const tagsSpec = useMemo(
    () =>
      computeUnionTagsSpec(
        platformCodes
          .map((code) => ({ code, kind: kindByPlatform[code] }))
          .filter((x): x is { code: string; kind: PublishKind } => !!x.kind),
      ),
    [platformCodes, kindByPlatform],
  )

  const isMultiPlatform = platformCodes.length > 1
  const singlePlatformCode = platformCodes.length === 1 ? platformCodes[0] : ''
  const singleKind: PublishKind | undefined = singlePlatformCode ? kindByPlatform[singlePlatformCode] : undefined
  const dominantKind: PublishKind = singleKind ?? (() => {
    const kinds = new Set(Object.values(kindByPlatform))
    if (kinds.size === 1) return kinds.values().next().value as PublishKind
    return inferredKind
  })()

  const constraint = platformCodes.length > 0 ? aggregateSpec : undefined
  const titleRange = constraint?.title
  const descRange = constraint?.content ?? constraint?.desc
  const imagesRange = constraint?.images ?? constraint?.covers
  const prePubSpec = constraint?.prePubTime

  const categoryPlatforms = useMemo(
    () =>
      platformCodes.filter((c) => {
        const k = kindByPlatform[c]
        return !!k && categoryRequirement(c, k) !== 'none'
      }),
    [platformCodes, kindByPlatform],
  )

  const prePubTimeMs = useMemo(() => {
    if (mode !== 'publish' || !scheduleEnabled || !scheduleLocal) return null
    const ms = new Date(scheduleLocal).getTime()
    return Number.isNaN(ms) ? null : ms
  }, [mode, scheduleEnabled, scheduleLocal])

  const scheduleBounds = useMemo(() => {
    if (!prePubSpec) return null
    const toLocal = (ms: number) => {
      const d = new Date(ms)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    const now = Date.now()
    return {
      min: toLocal(now + prePubSpec.minHours * 3600 * 1000),
      max: toLocal(now + prePubSpec.maxDays * 24 * 3600 * 1000),
    }
  }, [prePubSpec])

  const categoryError = useMemo(() => {
    for (const code of categoryPlatforms) {
      const k = kindByPlatform[code]
      if (k && categoryRequirement(code, k) === 'required' && !categorySelByPlatform[code]?.l1) {
        return `「${getPlatformName(code)}」需选择内容分类`
      }
    }
    return null
  }, [categoryPlatforms, kindByPlatform, categorySelByPlatform])

  const allPlatformsHaveAccount = platformCodes.every(
    (code) => (selectedAccountIdsByPlatform[code]?.size ?? 0) > 0,
  )
  const totalSelectedAccounts = platformCodes.reduce(
    (sum, code) => sum + (selectedAccountIdsByPlatform[code]?.size ?? 0),
    0,
  )

  // ── 账号加载 effect ──
  useEffect(() => {
    setSelectedAccountIdsByPlatform((s) => {
      const filtered: Record<string, Set<string>> = {}
      for (const [k, v] of Object.entries(s)) if (platformCodes.includes(k)) filtered[k] = v
      return filtered
    })
    for (const code of platformCodes) {
      if (accountsByPlatform[code]) continue
      setAccountsLoadingByPlatform((s) => ({ ...s, [code]: true }))
      void (async () => {
        try {
          const list = await tlfApi.listAccounts({ platform_code: code, status: 'active' })
          setAccountsByPlatform((s) => ({ ...s, [code]: list }))
        } catch (err) {
          toast.error(`「${getPlatformName(code)}」账号加载失败：${err instanceof ApiError ? err.message : '未知错误'}`)
        } finally {
          setAccountsLoadingByPlatform((s) => ({ ...s, [code]: false }))
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformCodes])

  // 一次性拉取用户全部活跃账号 → 已绑定平台集合（PlatformPicker 卡片「已绑定」标记用）
  useEffect(() => {
    void (async () => {
      try {
        const list = await tlfApi.listAccounts({ status: 'active' })
        setBoundPlatformCodes(new Set(list.map((a) => a.platform_code)))
      } catch {
        /* 静默失败：标记仅增强信息，拉取失败不影响平台选择 */
      }
    })()
  }, [])

  // 回灌：账号池加载完成后预选 pending 账号
  useEffect(() => {
    const pending = pendingSelRef.current
    if (!pending) return
    let allReady = true
    const next: Record<string, Set<string>> = {}
    for (const [code, ids] of Object.entries(pending)) {
      const pool = accountsByPlatform[code]
      if (!pool) { allReady = false; continue }
      const valid = new Set(pool.map((a) => a.id))
      next[code] = new Set(ids.filter((id) => valid.has(id)))
    }
    if (Object.keys(next).length > 0) {
      setSelectedAccountIdsByPlatform((s) => ({ ...s, ...next }))
    }
    if (allReady) pendingSelRef.current = null
  }, [accountsByPlatform])

  // ── 分类加载 effect ──
  useEffect(() => {
    for (const code of categoryPlatforms) {
      if (categoryOptsByPlatform[code] || categoryLoadingByPlatform[code]) continue
      const pool = accountsByPlatform[code] ?? []
      if (pool.length === 0) continue
      const kind = kindByPlatform[code]
      if (!kind) continue
      const probeAccId = pool[0].id
      setCategoryLoadingByPlatform((s) => ({ ...s, [code]: true }))
      void (async () => {
        try {
          const cats = await tlfApi.getCategories(probeAccId, kind)
          const list = cats || []
          setCategoryOptsByPlatform((s) => ({ ...s, [code]: list }))
          setCategoryLoadErrorByPlatform((s) => { const { [code]: _, ...rest } = s; return rest })
          if (list.length > 0 && categoryRequirement(code, kind) === 'required') {
            setCategorySelByPlatform((s) => {
              if (s[code]?.l1) return s
              const l1 = list[0]
              const l2 = l1.child && l1.child.length > 0 ? l1.child[0] : null
              return { ...s, [code]: { l1, l2 } }
            })
          }
        } catch (err) {
          // 预加载失败不弹全局 toast（预加载在选平台阶段就跑，弹窗对「还没配置」的用户是噪声）。
          // 改为按平台记错误，由「内容分类」区就地提示：可选平台淡色提示、必填平台红字引导重新授权。
          const msg = err instanceof ApiError ? err.message : '未知错误'
          setCategoryLoadErrorByPlatform((s) => ({ ...s, [code]: msg }))
          setCategoryOptsByPlatform((s) => ({ ...s, [code]: [] }))
        } finally {
          setCategoryLoadingByPlatform((s) => ({ ...s, [code]: false }))
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryPlatforms, accountsByPlatform])

  // ── helpers ──
  const togglePlatform = useCallback((code: string) => {
    setPlatformCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }, [])
  const selectAllPlatforms = useCallback(
    () => setPlatformCodes(compatiblePlatforms.map((p) => p.code)),
    [compatiblePlatforms],
  )
  const clearAllPlatforms = useCallback(() => setPlatformCodes([]), [])
  const toggleAccount = useCallback((platformCode: string, id: string) => {
    setSelectedAccountIdsByPlatform((prev) => {
      const cur = new Set(prev[platformCode] ?? [])
      if (cur.has(id)) cur.delete(id)
      else cur.add(id)
      return { ...prev, [platformCode]: cur }
    })
  }, [])
  const toggleAllAccountsFor = useCallback((platformCode: string) => {
    const accounts = accountsByPlatform[platformCode] ?? []
    setSelectedAccountIdsByPlatform((prev) => {
      const cur = prev[platformCode] ?? new Set<string>()
      if (cur.size === accounts.length) return { ...prev, [platformCode]: new Set() }
      return { ...prev, [platformCode]: new Set(accounts.map((a) => a.id)) }
    })
  }, [accountsByPlatform])
  const setCategory = useCallback((code: string, l1: TlfCategoryNode | null, l2: TlfCategoryNode | null) => {
    setCategorySelByPlatform((s) => ({ ...s, [code]: { l1, l2 } }))
  }, [])

  /** 用后端 distribute_config + 批量设置回灌（rule 编辑进入时调用一次） */
  const hydrate = useCallback((init: DistributeConfigInit) => {
    if (init.platforms) setPlatformCodes(init.platforms)
    if (init.accounts) pendingSelRef.current = init.accounts
    if (typeof init.isPublic === 'boolean') setIsPublic(init.isPublic)
    if (typeof init.original === 'boolean') setOriginalChecked(init.original)
    if (typeof init.ai === 'boolean') setAiChecked(init.ai)
    if (init.category) setCategorySelByPlatform(init.category)
    if (init.redditSubreddit) setRedditSubreddit(init.redditSubreddit)
  }, [])

  /** 序列化为后端 distribute_config（rule 保存用）；extras 复用 computePerPlatformBatchExtras + 分类 */
  const serialize = useCallback((): DistributeConfigPayload => {
    const accounts: Record<string, string[]> = {}
    const extras: Record<string, Record<string, unknown>> = {}
    for (const code of platformCodes) {
      const kind = kindByPlatform[code]
      if (!kind) continue
      accounts[code] = Array.from(selectedAccountIdsByPlatform[code] ?? [])
      const e: Record<string, unknown> = computePerPlatformBatchExtras({
        platformCode: code,
        kind,
        originalChecked,
        aiChecked,
        isPublic,
        scheduleEnabled: false, // 规则定时由 cron 决定，不下发 pre_pub_time
        prePubTimeMs: null,
      })
      const sel = categorySelByPlatform[code]
      if (sel?.l1) {
        const { child: _c1, ...l1 } = sel.l1
        e.category = l1
        if (sel.l2) {
          const { child: _c2, ...l2 } = sel.l2
          e.sub_category = l2
        }
      }
      // Reddit 必填版块：规则模式固化到 extra.subreddit，透传到网关 body.extra
      if (code === 'Reddit' && redditSubreddit.trim()) {
        e.extra = { subreddit: redditSubreddit.trim() }
      }
      extras[code] = e
    }
    const uiCategory: Record<string, CatSel> = {}
    for (const code of platformCodes) {
      if (categorySelByPlatform[code]?.l1) uiCategory[code] = categorySelByPlatform[code]
    }
    return {
      platforms: [...platformCodes],
      accounts,
      extras,
      ui: { isPublic, original: originalChecked, ai: aiChecked, category: uiCategory },
    }
  }, [platformCodes, kindByPlatform, selectedAccountIdsByPlatform, originalChecked, aiChecked, isPublic, categorySelByPlatform, redditSubreddit])

  return {
    mode,
    inferredKind,
    allowedKinds,
    // state
    platformCodes, setPlatformCodes,
    accountsByPlatform, accountsLoadingByPlatform, selectedAccountIdsByPlatform,
    boundPlatformCodes,
    categoryOptsByPlatform, categoryLoadingByPlatform, categoryLoadErrorByPlatform, categorySelByPlatform,
    isPublic, setIsPublic,
    originalChecked, setOriginalChecked,
    aiChecked, setAiChecked,
    redditSubreddit, setRedditSubreddit,
    scheduleEnabled, setScheduleEnabled,
    scheduleLocal, setScheduleLocal,
    // derived
    visiblePlatforms, compatiblePlatforms, kindByPlatform, aggregateSpec, tagsSpec,
    isMultiPlatform, singlePlatformCode, singleKind, dominantKind,
    constraint, titleRange, descRange, imagesRange, prePubSpec, scheduleBounds,
    categoryPlatforms, prePubTimeMs, categoryError, allPlatformsHaveAccount, totalSelectedAccounts,
    // helpers
    togglePlatform, selectAllPlatforms, clearAllPlatforms,
    toggleAccount, toggleAllAccountsFor, setCategory,
    hydrate, serialize,
  }
}

export type DistributionConfig = ReturnType<typeof useDistributionConfig>
