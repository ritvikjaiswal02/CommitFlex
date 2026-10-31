'use client'

import { useCallback, useState } from 'react'
import type { QueueItemView } from '@/types/autopilot'
import { toast } from '@/components/ui/toast'

/**
 * Approves several drafts one after another (so each takes the next free
 * slot in order) and reports one toast for the batch instead of one each.
 */
export function useBulkApprove(onItem: (item: QueueItemView) => void, onDone?: () => void) {
  const [running, setRunning] = useState(false)

  const approveAll = useCallback(
    async (draftIds: string[]) => {
      if (draftIds.length === 0) return 0
      setRunning(true)
      let approved = 0
      try {
        for (const draftId of draftIds) {
          const res = await fetch(`/api/drafts/${draftId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          }).catch(() => null)
          if (!res?.ok) continue
          const body = (await res.json().catch(() => ({}))) as { item?: QueueItemView }
          if (body.item) onItem(body.item)
          approved += 1
        }
      } finally {
        setRunning(false)
        onDone?.()
      }
      if (approved === draftIds.length) {
        toast.success(`Approved ${approved} ${approved === 1 ? 'draft' : 'drafts'}`, {
          description: 'Each one took the next free slot in your schedule.',
        })
      } else {
        toast.error(`Approved ${approved} of ${draftIds.length} drafts`, {
          description: 'Some drafts changed since the page loaded. Refresh and approve the rest one by one.',
        })
      }
      return approved
    },
    [onItem, onDone],
  )

  return { approveAll, running }
}
