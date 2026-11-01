'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Subscribes to `/api/jobs/:jobId/stream` (SSE `update` events with
 * `{ status, drafts }`) until the job reaches a terminal status.
 *
 * `onUpdate` is read through a ref, so passing an inline function does not
 * reopen the stream on every render. When the connection drops before the
 * job finishes, it reconnects with a short backoff (up to 5 attempts).
 */

export interface JobUpdate<TDraft = unknown> {
  status: string
  drafts: TDraft[]
}

export interface UseJobStreamOptions<TDraft = unknown> {
  jobId: string
  initialStatus: string
  onUpdate: (update: JobUpdate<TDraft>) => void
  /** Called once when the stream reports a terminal status. */
  onDone?: (status: string) => void
}

export const TERMINAL_JOB_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'partial_completed',
  'failed',
  'cancelled',
])

export function isTerminalJobStatus(status: string): boolean {
  return TERMINAL_JOB_STATUSES.has(status)
}

const MAX_RETRIES = 5

export function useJobStream<TDraft = unknown>({ jobId, initialStatus, onUpdate, onDone }: UseJobStreamOptions<TDraft>) {
  const [connected, setConnected] = useState(false)
  const [lostConnection, setLostConnection] = useState(false)
  const onUpdateRef = useRef(onUpdate)
  const onDoneRef = useRef(onDone)
  onUpdateRef.current = onUpdate
  onDoneRef.current = onDone

  const done = isTerminalJobStatus(initialStatus)

  useEffect(() => {
    if (done || typeof EventSource === 'undefined') return

    let es: EventSource | null = null
    let retries = 0
    let finished = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const open = () => {
      es = new EventSource(`/api/jobs/${jobId}/stream`)
      es.addEventListener('open', () => {
        retries = 0
        setConnected(true)
        setLostConnection(false)
      })
      es.addEventListener('update', (event) => {
        let data: JobUpdate<TDraft>
        try {
          data = JSON.parse((event as MessageEvent<string>).data) as JobUpdate<TDraft>
        } catch {
          return
        }
        onUpdateRef.current(data)
        if (isTerminalJobStatus(data.status)) {
          finished = true
          es?.close()
          setConnected(false)
          onDoneRef.current?.(data.status)
        }
      })
      es.addEventListener('error', () => {
        es?.close()
        setConnected(false)
        if (finished) return
        if (retries >= MAX_RETRIES) {
          setLostConnection(true)
          return
        }
        retries += 1
        timer = setTimeout(open, Math.min(1000 * 2 ** (retries - 1), 8000))
      })
    }

    open()

    return () => {
      finished = true
      if (timer) clearTimeout(timer)
      es?.close()
      setConnected(false)
    }
  }, [jobId, done])

  return { connected, lostConnection }
}
