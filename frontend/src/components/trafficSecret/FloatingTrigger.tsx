import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, Flame } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/utils/helpers'

type Props = {
  onOpen: () => void
}

const MARGIN = 80
const MOVE_THRESHOLD = 4
const COLLAPSE_DELAY_MS = 2200
const SLIM_HIDDEN_PX = 10 // 收起时露出多少像素

export function FloatingTrigger({ onOpen }: Props) {
  const { t } = useTranslation()
  const [posY, setPosY] = useState<number>(() => {
    if (typeof window === 'undefined') return 320
    return Math.round(window.innerHeight * 0.45)
  })
  const [isDragging, setIsDragging] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const dragStartRef = useRef({ x: 0, y: 0, posY: 0 })
  const hasMovedRef = useRef(false)
  const isDraggingRef = useRef(false)
  const hoverTimeoutRef = useRef<number | null>(null)

  const clearHoverTimer = useCallback(() => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    const onResize = () => {
      setPosY((prev) => Math.max(MARGIN, Math.min(window.innerHeight - MARGIN, prev)))
    }
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => clearHoverTimer, [clearHoverTimer])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDraggingRef.current) return
    const dx = Math.abs(e.clientX - dragStartRef.current.x)
    const dy = Math.abs(e.clientY - dragStartRef.current.y)
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      hasMovedRef.current = true
    }
    const newY = Math.max(
      MARGIN,
      Math.min(
        window.innerHeight - MARGIN,
        dragStartRef.current.posY + (e.clientY - dragStartRef.current.y),
      ),
    )
    setPosY(newY)
  }, [])

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    setIsDragging(false)
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    if (!hasMovedRef.current) {
      onOpen()
    }
  }, [handlePointerMove, onOpen])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      isDraggingRef.current = true
      hasMovedRef.current = false
      dragStartRef.current = { x: e.clientX, y: e.clientY, posY }
      setIsDragging(true)
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    },
    [posY, handlePointerMove, handlePointerUp],
  )

  const handleMouseEnter = () => {
    clearHoverTimer()
    setIsHovered(true)
    setIsCollapsed(false)
  }

  const handleMouseLeave = () => {
    if (isDragging) return
    clearHoverTimer()
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(false)
      setIsCollapsed(true)
    }, COLLAPSE_DELAY_MS)
  }

  const showSlim = isCollapsed && !isHovered && !isDragging

  return (
    <div
      onPointerDown={handlePointerDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
      aria-label={t('trafficSecret.title', '流量密码')}
      className={cn(
        'fixed right-0 z-40 select-none touch-none',
        'flex w-10 flex-col items-center gap-1.5 rounded-l-2xl py-3',
        'border border-r-0 border-white/25 text-white shadow-pop',
        'bg-gradient-to-b from-primary to-pink-500',
        'hover:from-primary/95 hover:to-pink-500/95 hover:shadow-lg',
        isDragging ? 'cursor-grabbing' : 'cursor-pointer',
      )}
      style={{
        top: posY,
        transform: `translate(${showSlim ? `calc(100% - ${SLIM_HIDDEN_PX}px)` : '0'}, -50%)`,
        transition: isDragging ? 'none' : 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <Flame className="h-4 w-4 shrink-0" strokeWidth={2.4} />
      <span
        className="text-[12px] font-semibold leading-[1.05] tracking-[0.18em]"
        style={{
          writingMode: 'vertical-rl',
          textOrientation: 'upright',
        }}
      >
        {t('trafficSecret.title', '流量密码')}
      </span>
      <ChevronLeft
        className={cn(
          'h-3 w-3 shrink-0 opacity-80 transition-transform',
          showSlim ? 'rotate-180' : 'rotate-0',
        )}
      />
    </div>
  )
}
