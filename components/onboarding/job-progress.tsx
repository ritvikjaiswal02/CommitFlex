'use client'

import * as React from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type JobPhase = 'connecting' | 'running' | 'completed' | 'failed'

const STAGES: { key: string; label: string; statuses: string[] }[] = [
  { key: 'fetch', label: 'Reading commits', statuses: ['queued', 'fetching_commits'] },
  { key: 'summarize', label: 'Summarising changes', statuses: ['summarizing', 'prefetched'] },
  { key: 'narrative', label: 'Finding the story', statuses: ['extracting_narrative'] },
  { key: 'generate', label: 'Writing drafts', statuses: ['generating_posts'] },
]

const TERMINAL_OK = new Set(['completed', 'partial_completed'])
const TERMINAL_FAIL = new Set(['failed', 'cancelled'])

export interface JobStreamState {
  status: string | null
  phase: JobPhase
  draftCount: number
}

/**
 * Follows a generation job over SSE (`/api/jobs/:id/stream`, `update` events).
 * Closes the stream on a terminal status so EventSource doesn't reconnect.
 */
export function useJobStream(jobId: string | null): JobStreamState {
  const [state, setState] = React.useState<JobStreamState>({
    status: null,
    phase: jobId ? 'connecting' : 'failed',
    draftCount: 0,
  })

  React.useEffect(() => {
    if (!jobId) return
    // A new job (e.g. after Try again) starts from scratch.
    setState({ status: null, phase: 'connecting', draftCount: 0 })
    let closed = false
    const source = new EventSource(`/api/jobs/${jobId}/stream`)

    source.addEventListener('update', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as { status?: string; drafts?: unknown[] }
        const status = data.status ?? null
        const draftCount = Array.isArray(data.drafts) ? data.drafts.length : 0
        const phase: JobPhase =
          status && TERMINAL_OK.has(status) ? 'completed' : status && TERMINAL_FAIL.has(status) ? 'failed' : 'running'
        setState({ status, phase, draftCount })
        if (phase === 'completed' || phase === 'failed') {
          closed = true
          source.close()
        }
      } catch {
        // ignore malformed events
      }
    })

    source.onerror = () => {
      // The server closes the stream after a terminal update; anything else
      // is a dropped connection and EventSource retries on its own.
      if (closed) source.close()
    }

    return () => {
      closed = true
      source.close()
    }
  }, [jobId])

  return state
}

function stageIndex(status: string | null): number {
  if (!status) return 0
  if (TERMINAL_OK.has(status)) return STAGES.length
  const i = STAGES.findIndex((s) => s.statuses.includes(status))
  return i === -1 ? 0 : i
}

/** Four stages on a horizontal commit rail; the current one pulses its ring. */
export function JobProgressStrip({ status, phase }: { status: string | null; phase: JobPhase }) {
  const current = stageIndex(status)
  const failed = phase === 'failed'
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:gap-0" aria-label="Draft progress">
      {STAGES.map((stage, i) => {
        const done = i < current
        const active = i === current && !failed && phase !== 'completed'
        const errored = failed && i === current
        return (
          <li key={stage.key} className="relative flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
            {i < STAGES.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-[calc(1rem+8px)] right-0 top-[7.5px] hidden h-px sm:block',
                  done ? 'bg-accent' : 'bg-line-strong',
                )}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'relative z-[1] flex size-4 shrink-0 items-center justify-center rounded-full ring-4 ring-surface',
                done && 'bg-accent text-accent-fg',
                active && 'border-2 border-accent bg-surface',
                errored && 'bg-danger text-white',
                !done && !active && !errored && 'border-[1.5px] border-line-strong bg-surface',
              )}
            >
              {done && <Check className="size-2.5" strokeWidth={3} />}
              {errored && <X className="size-2.5" strokeWidth={3} />}
              {active && <span className="size-1.5 rounded-full bg-accent motion-safe:animate-pulse" />}
            </span>
            <span
              className={cn(
                'text-sm sm:pr-4',
                done ? 'text-fg' : active ? 'font-medium text-fg' : errored ? 'text-danger' : 'text-fg-subtle',
              )}
            >
              {stage.label}
              <span className="sr-only">
                {done ? ' (done)' : active ? ' (in progress)' : errored ? ' (stopped)' : ''}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
