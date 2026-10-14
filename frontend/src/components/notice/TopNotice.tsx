import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, X } from 'lucide-react'

import { useAuthStore } from '@/stores/authStore'
import { noticeApi, type NoticeAccent, type NoticeItem } from '@/api/notice'
import { cn } from '@/utils/helpers'

const SESSION_DISMISS_KEY = 'matrix365_top_notice_dismissed'
const ROTATE_INTERVAL_MS = 6000
const BAR_HEIGHT = 42

const ACCENT_BG: Record<NoticeAccent, string> = {
  primary: 'bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500',
  emerald: 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400',
  forest: 'bg-gradient-to-r from-green-700 via-lime-500 to-yellow-400',
  sky: 'bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500',
  ocean: 'bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-400',
  sunset: 'bg-gradient-to-r from-red-500 via-orange-500 to-yellow-400',
  berry: 'bg-gradient-to-r from-purple-600 via-pink-600 to-red-500',
  midnight: 'bg-gradient-to-r from-slate-800 via-indigo-700 to-purple-700',
}

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(SESSION_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function setDismissed() {
  try {
    sessionStorage.setItem(SESSION_DISMISS_KEY, '1')
  } catch {
    // ignore
  }
}

export function TopNotice() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [items, setItems] = useState<NoticeItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [dismissed, setDismissedState] = useState(() => readDismissed())
  const [index, setIndex] = useState(0)

  // 登出时重置 — 让下次登录又能看到
  useEffect(() => {
    if (!isAuthenticated) {
      try {
        sessionStorage.removeItem(SESSION_DISMISS_KEY)
      } catch {
        // ignore
      }
      setDismissedState(false)
      setItems([])
      setLoaded(false)
      setIndex(0)
    }
  }, [isAuthenticated])

  // 登录后拉一次
  useEffect(() => {
    if (!isAuthenticated || loaded || dismissed) return
    let cancelled = false
    noticeApi
      .list()
      .then((data) => {
        if (cancelled) return
        setItems(data?.items ?? [])
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setItems([])
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, loaded, dismissed])

  const visible = useMemo(
    () => isAuthenticated && !dismissed && items.length > 0,
    [isAuthenticated, dismissed, items.length],
  )

  // 自动轮播
  useEffect(() => {
    if (!visible || items.length <= 1) return
    const t = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length)
    }, ROTATE_INTERVAL_MS)
    return () => window.clearInterval(t)
  }, [visible, items.length])

  const handleClose = useCallback(() => {
    setDismissed()
    setDismissedState(true)
  }, [])

  const handleClick = useCallback(
    (item: NoticeItem) => {
      const url = (item.linkUrl ?? '').trim()
      if (!url) return
      if (/^https?:\/\//i.test(url)) {
        window.open(url, '_blank', 'noopener,noreferrer')
      } else if (url.startsWith('/')) {
        navigate(url)
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    },
    [navigate],
  )

  const current = items[index] ?? null
  const accent: NoticeAccent =
    current?.accent && current.accent in ACCENT_BG
      ? (current.accent as NoticeAccent)
      : 'primary'

  return (
    <AnimatePresence initial={false}>
      {visible && current && (
        <motion.div
          key="top-notice"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: BAR_HEIGHT, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            height: { type: 'spring', stiffness: 360, damping: 32 },
            opacity: { duration: 0.18 },
          }}
          className="relative z-30 shrink-0 overflow-hidden"
        >
          <div
            className={cn(
              'relative flex h-full w-full items-center justify-center text-white shadow-soft',
              ACCENT_BG[accent],
            )}
            style={{ height: BAR_HEIGHT }}
          >
            {/* 装饰光斑 */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              <div className="absolute -left-16 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -right-16 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full bg-white/10 blur-2xl" />
            </div>

            {/* 主内容 */}
            <button
              type="button"
              onClick={() => handleClick(current)}
              disabled={!current.linkUrl}
              className={cn(
                'relative z-10 flex max-w-[80%] items-center gap-1.5 truncate px-3 py-1 text-[13px] sm:text-sm',
                current.linkUrl
                  ? 'cursor-pointer hover:underline underline-offset-4 decoration-white/60'
                  : 'cursor-default',
              )}
            >
              <span className="truncate font-medium tracking-wide">{current.text}</span>
              {current.linkUrl && (
                <ChevronRight className="h-4 w-4 shrink-0 opacity-80" />
              )}
            </button>

            {/* 底部小触控条（多条时） */}
            {items.length > 1 && (
              <div className="absolute bottom-1 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1">
                {items.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`第 ${i + 1} 条`}
                    className={cn(
                      'h-1 rounded-full bg-white transition-all cursor-pointer',
                      i === index ? 'w-5 opacity-100' : 'w-1.5 opacity-50 hover:opacity-80',
                    )}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="absolute right-2.5 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/25 cursor-pointer"
              aria-label="关闭公告"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
