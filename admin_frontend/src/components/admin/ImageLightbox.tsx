import * as React from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { cn } from '@/lib/utils'

export type ImageLightboxProps = {
  /** 图片 URL 列表 */
  images: string[]
  /** 初始展示的索引 */
  startIndex?: number
  onClose: () => void
}

const MIN_SCALE = 0.5
const MAX_SCALE = 4
const STEP = 0.25

function ToolBtn({
  onClick,
  title,
  disabled,
  className,
  children,
}: {
  onClick: () => void
  title: string
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center justify-center rounded-lg bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-30',
        className,
      )}
    >
      {children}
    </button>
  )
}

/**
 * 通用图片预览灯箱：portal 到 body，置于一切浮层之上（z-[9999]）。
 * 功能：缩放（按钮 / 滚轮 / 快捷键）、拖拽平移、左右切换、键盘导航、下载。
 *
 * 在 Radix 模态（Dialog/Sheet）内使用时：
 *  - 容器显式 `pointer-events-auto`，抵消 Radix 给 body 设的 `pointer-events:none`；
 *  - 键盘事件在 window 捕获阶段 `stopImmediatePropagation`，先于 Radix 注册在 document 上的
 *    监听，避免 ESC / 方向键被外层抢走；
 *  - 仍需给外层 Drawer 传 `lockClose`，阻止其 outside-click 自动关闭（见 DetailDrawer）。
 */
export function ImageLightbox({ images, startIndex = 0, onClose }: ImageLightboxProps) {
  const count = images.length
  const [index, setIndex] = React.useState(() =>
    Math.min(Math.max(startIndex, 0), Math.max(count - 1, 0)),
  )
  const [scale, setScale] = React.useState(1)
  const [offset, setOffset] = React.useState({ x: 0, y: 0 })
  const dragRef = React.useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [dragging, setDragging] = React.useState(false)

  const isMulti = count > 1
  const current = images[index]

  const resetView = React.useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const goPrev = React.useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
  }, [])
  const goNext = React.useCallback(() => {
    setIndex((i) => Math.min(count - 1, i + 1))
  }, [count])

  const zoomIn = React.useCallback(() => setScale((s) => Math.min(MAX_SCALE, s + STEP)), [])
  const zoomOut = React.useCallback(
    () =>
      setScale((s) => {
        const next = Math.max(MIN_SCALE, s - STEP)
        if (next <= 1) setOffset({ x: 0, y: 0 })
        return next
      }),
    [],
  )

  // 切换图片时重置缩放 / 平移
  React.useEffect(() => {
    resetView()
  }, [index, resetView])

  // 键盘：window 捕获阶段拦截，先于 Radix（注册在 document）触发，避免被外层 Drawer 抢走
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.stopImmediatePropagation()
          e.preventDefault()
          onClose()
          break
        case 'ArrowLeft':
          if (isMulti) {
            e.stopImmediatePropagation()
            goPrev()
          }
          break
        case 'ArrowRight':
          if (isMulti) {
            e.stopImmediatePropagation()
            goNext()
          }
          break
        case '+':
        case '=':
          zoomIn()
          break
        case '-':
        case '_':
          zoomOut()
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [isMulti, goPrev, goNext, zoomIn, zoomOut, onClose])

  // 打开时锁定 body 滚动
  React.useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (e.deltaY < 0) zoomIn()
    else zoomOut()
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    setDragging(true)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.x),
      y: dragRef.current.oy + (e.clientY - dragRef.current.y),
    })
  }
  const endDrag = () => {
    dragRef.current = null
    setDragging(false)
  }

  const handleDownload = async () => {
    if (!current) return
    try {
      const res = await fetch(current)
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const obj = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = obj
      const m = current.split('?')[0].match(/[^/]+\.\w+$/)
      a.download = m ? m[0] : `image-${index + 1}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(obj)
    } catch {
      toast.error('下载失败，请检查网络或稍后重试')
    }
  }

  if (!current || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[9999] flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* 顶部工具栏 */}
      <div className="flex shrink-0 items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          {isMulti && (
            <span className="rounded-lg bg-white/10 px-2 py-0.5 text-xs tabular-nums text-white/70">
              {index + 1} / {count}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ToolBtn onClick={zoomOut} title="缩小" disabled={scale <= MIN_SCALE}>
            <ZoomOut className="size-5" />
          </ToolBtn>
          <span className="w-12 text-center text-xs tabular-nums text-white/70">
            {Math.round(scale * 100)}%
          </span>
          <ToolBtn onClick={zoomIn} title="放大" disabled={scale >= MAX_SCALE}>
            <ZoomIn className="size-5" />
          </ToolBtn>
          <ToolBtn onClick={resetView} title="复位" disabled={scale === 1 && offset.x === 0 && offset.y === 0}>
            <RotateCcw className="size-5" />
          </ToolBtn>
          <ToolBtn onClick={() => void handleDownload()} title="下载">
            <Download className="size-5" />
          </ToolBtn>
          <ToolBtn onClick={onClose} title="关闭" className="hover:bg-rose-500/30">
            <X className="size-5" />
          </ToolBtn>
        </div>
      </div>

      {/* 主区域 */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {isMulti && (
          <button
            type="button"
            onClick={goPrev}
            disabled={index === 0}
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-colors hover:bg-white/20 disabled:pointer-events-none disabled:opacity-20"
            aria-label="上一张"
          >
            <ChevronLeft className="size-7" />
          </button>
        )}

        <div
          className="flex size-full items-center justify-center px-16"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }}
        >
          <img
            src={current}
            alt=""
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[82vh] max-w-full select-none rounded-lg object-contain shadow-2xl"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transition: dragging ? 'none' : 'transform 0.15s ease-out',
            }}
          />
        </div>

        {isMulti && (
          <button
            type="button"
            onClick={goNext}
            disabled={index === count - 1}
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-colors hover:bg-white/20 disabled:pointer-events-none disabled:opacity-20"
            aria-label="下一张"
          >
            <ChevronRight className="size-7" />
          </button>
        )}
      </div>

      {/* 底部缩略图 */}
      {isMulti && count <= 20 && (
        <div className="flex shrink-0 justify-center p-4">
          <div className="flex gap-2 rounded-xl border border-white/10 bg-black/50 px-3 py-2 backdrop-blur-xl">
            {images.map((url, i) => (
              <button
                key={`${url}-${i}`}
                type="button"
                onClick={() => setIndex(i)}
                className={cn(
                  'size-14 cursor-pointer overflow-hidden rounded-lg border-2 transition-colors',
                  i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100',
                )}
              >
                <img src={url} alt="" className="size-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
