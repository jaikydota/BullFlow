import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useIsMobile } from '@/hooks/useMediaQuery'
import { useAuthStore } from '@/stores/authStore'
import { trafficSecretApi, type TrafficSecretItem } from '@/api/trafficSecret'

import { DetailView } from './DetailView'
import { FloatingTrigger } from './FloatingTrigger'
import { ListPanel } from './ListPanel'

type View = 'list' | 'detail'

const PANEL_WIDTH = 420

export function TrafficSecretWidget() {
  const isMobile = useIsMobile()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [isOpen, setIsOpen] = useState(false)
  const [items, setItems] = useState<TrafficSecretItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState<View>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const data = await trafficSecretApi.list()
      setItems(data?.items ?? [])
      setLoaded(true)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [loading])

  const openPanel = useCallback(() => {
    setIsOpen(true)
    setView('list')
    if (!loaded) {
      void loadItems()
    }
  }, [loaded, loadItems])

  const closePanel = useCallback(() => {
    setIsOpen(false)
    setSelectedId(null)
    setView('list')
  }, [])

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    setView('detail')
  }, [])

  const handleBack = useCallback(() => {
    setView('list')
    setSelectedId(null)
  }, [])

  // ESC 关闭
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, closePanel])

  const selectedItem = useMemo(
    () => items.find((it) => it.id === selectedId) ?? null,
    [items, selectedId],
  )

  if (isMobile || !isAuthenticated) {
    return null
  }

  return (
    <>
      {!isOpen && <FloatingTrigger onOpen={openPanel} />}

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="traffic-secret-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/20"
              onClick={closePanel}
            />
            <motion.div
              key="traffic-secret-panel"
              initial={{ x: PANEL_WIDTH + 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: PANEL_WIDTH + 24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed right-4 top-4 bottom-4 z-40 overflow-hidden rounded-2xl border border-border bg-card shadow-modal"
              style={{ width: PANEL_WIDTH }}
            >
              {view === 'list' && (
                <ListPanel
                  items={items}
                  loading={loading}
                  onSelect={handleSelect}
                  onClose={closePanel}
                />
              )}
              {view === 'detail' && selectedItem && (
                <DetailView item={selectedItem} onBack={handleBack} />
              )}
              {view === 'detail' && !selectedItem && (
                <ListPanel
                  items={items}
                  loading={loading}
                  onSelect={handleSelect}
                  onClose={closePanel}
                />
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
