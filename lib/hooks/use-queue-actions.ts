'use client'

import { useCallback, useRef, useState } from 'react'
import type { PublishResult, QueueItemView } from '@/types/autopilot'
import type { PostPlatform } from '@/types/posts'
import { useUpgrade } from '@/components/billing/upgrade-provider'
import { toast } from '@/components/ui/toast'
import { buildLinkedInComposeUrl, buildXIntentUrl, composePostText } from '@/lib/publish/intents'
import { formatSlot, formatWhen } from '@/components/app/format'

/**
 * Every queue action the app offers (approve, schedule, skip, publish, mark
 * as posted), with the toasts, plan-error handling and pending state in one
 * place. Labels keep one verb through the flow: Approve → "Approved",
 * Schedule → "Scheduled for Tue, 9:30", Publish now → "Published to LinkedIn".
 */

export type QueueAction = 'approve' | 'schedule' | 'unschedule' | 'skip' | 'publish' | 'posted'

export interface PublishTarget {
  draftId: string
  platform: PostPlatform
  content: string
  hashtags: string[]
}

export interface UseQueueActionsOptions {
  timezone: string
  /** LinkedIn is connected and the plan includes `publish.linkedin_direct`. */
  linkedinDirect?: boolean
  /** Called with the updated item after every successful action. */
  onItem?: (item: QueueItemView) => void
}

export interface QueueActions {
  approve: (draftId: string) => Promise<QueueItemView | null>
  schedule: (draftId: string, at?: Date) => Promise<QueueItemView | null>
  unschedule: (draftId: string) => Promise<QueueItemView | null>
  skip: (draftId: string) => Promise<QueueItemView | null>
  publishNow: (target: PublishTarget) => Promise<{ item: QueueItemView; result: PublishResult } | null>
  markPosted: (draftId: string, method: 'x_intent' | 'manual', url?: string) => Promise<QueueItemView | null>
  /** Draft ids with an action in flight, and which action. */
  pending: Record<string, QueueAction>
  isPending: (draftId: string, action?: QueueAction) => boolean
}

const ERROR_TITLES: Record<QueueAction, string> = {
  approve: "Couldn't approve this draft",
  schedule: "Couldn't schedule this draft",
  unschedule: "Couldn't remove it from the schedule",
  skip: "Couldn't skip this draft",
  publish: "Couldn't publish this post",
  posted: "Couldn't mark it as posted",
}

interface ErrorBody {
  error?: unknown
  code?: string
}

function describeError(action: QueueAction, status: number, body: ErrorBody): string {
  switch (body.code) {
    case 'in_past':
      return 'That time has already passed. Pick a time in the future.'
    case 'slot_taken':
      return 'That slot already has a post for this platform. Pick another time.'
    case 'invalid_state':
      return 'This draft changed since the page loaded. Refresh to see where it is now.'
    case 'linkedin_not_connected':
      return 'Connect LinkedIn in Settings to publish directly, or post it yourself from the queue.'
    case 'upstream_error':
      return typeof body.error === 'string'
        ? `${body.error} We'll keep the post in your queue.`
        : 'The platform rejected the request. The post is still in your queue.'
    default:
      break
  }
  if (typeof body.error === 'string' && body.error.trim()) return body.error
  if (status === 404) return 'This draft no longer exists. It may have been deleted.'
  if (status === 401) return 'Your session ended. Sign in again to continue.'
  if (status >= 500) return 'The server had a problem. Try again in a moment.'
  return ERROR_TITLES[action]
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Opens a pre-filled composer in a new tab. Must run inside the click handler. */
function openComposer(url: string): boolean {
  if (typeof window === 'undefined') return false
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  return win !== null
}

function copyQuietly(text: string) {
  try {
    void navigator.clipboard?.writeText(text)
  } catch {
    // Clipboard access is a convenience here; the composer is pre-filled anyway.
  }
}

export function useQueueActions({ timezone, linkedinDirect = false, onItem }: UseQueueActionsOptions): QueueActions {
  const { handlePlanError } = useUpgrade()
  const [pending, setPending] = useState<Record<string, QueueAction>>({})
  const onItemRef = useRef(onItem)
  onItemRef.current = onItem

  const setFlight = useCallback((draftId: string, action: QueueAction | null) => {
    setPending((prev) => {
      const next = { ...prev }
      if (action) next[draftId] = action
      else delete next[draftId]
      return next
    })
  }, [])

  const request = useCallback(
    async <T extends Record<string, unknown>>(
      draftId: string,
      action: QueueAction,
      path: string,
      init: RequestInit,
    ): Promise<T | null> => {
      setFlight(draftId, action)
      try {
        const res = await fetch(path, {
          ...init,
          headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        })
        if (res.status === 402) {
          const handled = await handlePlanError(res)
          if (!handled) {
            const body = await readJson(res)
            toast.error(ERROR_TITLES[action], { description: describeError(action, 402, body) })
          }
          return null
        }
        const body = await readJson(res)
        if (!res.ok) {
          toast.error(ERROR_TITLES[action], { description: describeError(action, res.status, body) })
          return null
        }
        const item = body.item as QueueItemView | undefined
        if (item) onItemRef.current?.(item)
        return body as T
      } catch {
        toast.error(ERROR_TITLES[action], { description: 'Check your connection and try again.' })
        return null
      } finally {
        setFlight(draftId, null)
      }
    },
    [handlePlanError, setFlight],
  )

  const schedule = useCallback(
    async (draftId: string, at?: Date) => {
      const body = await request<{ item: QueueItemView }>(draftId, 'schedule', `/api/drafts/${draftId}/schedule`, {
        method: 'POST',
        body: JSON.stringify(at ? { at: at.toISOString() } : {}),
      })
      if (!body) return null
      const when = body.item.scheduledFor
      toast.success(when ? `Scheduled for ${formatSlot(when, timezone)}` : 'Scheduled')
      return body.item
    },
    [request, timezone],
  )

  const approve = useCallback(
    async (draftId: string) => {
      const body = await request<{ item: QueueItemView }>(draftId, 'approve', `/api/drafts/${draftId}/approve`, {
        method: 'POST',
        body: '{}',
      })
      if (!body) return null
      const when = body.item.scheduledFor
      toast.success('Approved', {
        description: when ? `It goes out ${formatWhen(when, timezone)}.` : 'Schedule it when you are ready.',
      })
      return body.item
    },
    [request, timezone],
  )

  const unschedule = useCallback(
    async (draftId: string) => {
      const body = await request<{ item: QueueItemView }>(draftId, 'unschedule', `/api/drafts/${draftId}/schedule`, {
        method: 'DELETE',
      })
      if (!body) return null
      toast('Removed from the schedule', { description: 'The draft stays in your queue without a time.' })
      return body.item
    },
    [request],
  )

  const skip = useCallback(
    async (draftId: string) => {
      const body = await request<{ item: QueueItemView }>(draftId, 'skip', `/api/drafts/${draftId}/skip`, {
        method: 'POST',
        body: '{}',
      })
      if (!body) return null
      toast('Skipped', {
        action: { label: 'Undo', onClick: () => void schedule(draftId) },
      })
      return body.item
    },
    [request, schedule],
  )

  const markPosted = useCallback(
    async (draftId: string, method: 'x_intent' | 'manual', url?: string) => {
      const body = await request<{ item: QueueItemView }>(draftId, 'posted', `/api/drafts/${draftId}/posted`, {
        method: 'POST',
        body: JSON.stringify(url ? { method, url } : { method }),
      })
      if (!body) return null
      toast.success('Marked as posted')
      return body.item
    },
    [request],
  )

  const publishNow = useCallback(
    async (target: PublishTarget) => {
      const { draftId, platform } = target
      const direct = platform === 'linkedin' && linkedinDirect
      let handedOff = false
      if (!direct) {
        // Open the composer synchronously inside the click so popup blockers allow it.
        const text = composePostText(target.content, target.hashtags, platform)
        if (platform === 'linkedin') copyQuietly(text)
        handedOff = openComposer(
          platform === 'twitter' ? buildXIntentUrl(text) : buildLinkedInComposeUrl(text),
        )
      }

      const body = await request<{ item: QueueItemView; result: PublishResult }>(
        draftId,
        'publish',
        `/api/drafts/${draftId}/publish`,
        { method: 'POST', body: '{}' },
      )
      if (!body) return null
      const { item, result } = body

      if (item.status === 'published' && result.method === 'linkedin_api') {
        toast.success('Published to LinkedIn', {
          action: result.url ? { label: 'View post', onClick: () => openComposer(result.url as string) } : undefined,
        })
        return body
      }

      const postedMethod = platform === 'twitter' ? 'x_intent' : 'manual'
      const where = platform === 'twitter' ? 'X' : 'LinkedIn'
      if (!handedOff && result.intentUrl) {
        toast.info(direct ? `LinkedIn didn't take the post, so it's ready to post yourself` : `Your post is ready for ${where}`, {
          description: `Open ${where} with the text filled in, then mark it as posted.`,
          duration: 0,
          action: { label: `Open ${where}`, onClick: () => openComposer(result.intentUrl as string) },
        })
        return body
      }
      toast.info(`Opened ${where} with your post`, {
        description:
          platform === 'linkedin'
            ? 'The text is also on your clipboard. Once it is live, mark it as posted.'
            : 'Once it is live, mark it as posted.',
        duration: 12000,
        action: { label: 'I posted it', onClick: () => void markPosted(draftId, postedMethod) },
      })
      return body
    },
    [linkedinDirect, markPosted, request],
  )

  const isPending = useCallback(
    (draftId: string, action?: QueueAction) => (action ? pending[draftId] === action : draftId in pending),
    [pending],
  )

  return { approve, schedule, unschedule, skip, publishNow, markPosted, pending, isPending }
}
