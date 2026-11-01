'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { QueueItemView } from '@/types/autopilot'

/**
 * Local copy of a server-loaded queue list that actions update in place.
 * When the server sends a fresh list (after `router.refresh()`), it wins.
 */
export function useQueueItems(initial: QueueItemView[]) {
  const [items, setItems] = useState<QueueItemView[]>(initial)

  useEffect(() => {
    setItems(initial)
  }, [initial])

  const upsert = useCallback((item: QueueItemView) => {
    setItems((prev) => {
      const index = prev.findIndex((i) => i.id === item.id || i.draftId === item.draftId)
      if (index === -1) return [...prev, item]
      const next = prev.slice()
      next[index] = { ...prev[index], ...item }
      return next
    })
  }, [])

  const updateContent = useCallback((draftId: string, content: string) => {
    setItems((prev) => prev.map((i) => (i.draftId === draftId ? { ...i, content } : i)))
  }, [])

  return { items, setItems, upsert, updateContent }
}

/** Which queue item (by draft id) the editor sheet shows. */
export function useEditorSelection(items: QueueItemView[], initialDraftId?: string | null) {
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null)
  const [open, setOpen] = useState(Boolean(initialDraftId))

  const selected = useMemo(
    () => (draftId ? items.find((i) => i.draftId === draftId) ?? null : null),
    [items, draftId],
  )

  const openItem = useCallback((item: Pick<QueueItemView, 'draftId'>) => {
    setDraftId(item.draftId)
    setOpen(true)
  }, [])

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next)
  }, [])

  return { selected, open: open && selected !== null, openItem, onOpenChange }
}
