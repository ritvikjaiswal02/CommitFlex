'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { StatusNode } from '@/components/ui/status-node'
import { JOB_STAGES, stageIndex } from '@/components/app/job-meta'

function useElapsed(since: string, running: boolean) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])
  const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000))
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}

/**
 * The run's stages on the commit-node rail. Done stages are filled, the
 * current one spins (static under reduced motion), later ones are hollow.
 */
export function JobProgress({
  status,
  startedAt,
  commitCount,
  className,
}: {
  status: string
  startedAt: string
  commitCount?: number | null
  className?: string
}) {
  const current = stageIndex(status)
  const running = current >= 0 && current < 5
  const elapsed = useElapsed(startedAt, running)

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-fg-muted" aria-live="polite">
          {current === 0
            ? 'Waiting for a worker to pick this up.'
            : current >= 5
              ? 'All four steps are done.'
              : `Step ${current} of 4: ${JOB_STAGES[current - 1]?.label.toLowerCase()}.`}
        </p>
        {running && <span className="text-sm tabular-nums text-fg-subtle">{elapsed}</span>}
      </div>
      <ol className="flex flex-col" aria-label="Progress">
        {JOB_STAGES.map((stage, i) => {
          const step = i + 1
          const state = current >= 5 || step < current ? 'done' : step === current ? 'active' : 'pending'
          const last = i === JOB_STAGES.length - 1
          return (
            <li key={stage.key} className="relative flex gap-3 pb-6 last:pb-0" aria-current={state === 'active' ? 'step' : undefined}>
              {!last && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute -bottom-0 left-2 top-5 w-px -translate-x-1/2',
                    state === 'done' ? 'bg-success/60' : 'bg-line-strong',
                  )}
                />
              )}
              <span className="relative z-[1] flex h-5 w-4 shrink-0 items-center justify-center">
                <span className="inline-flex rounded-full bg-surface ring-2 ring-surface">
                  <StatusNode
                    state={state === 'done' ? 'published' : state === 'active' ? 'publishing' : 'draft'}
                    label={state === 'done' ? `${stage.label}: done` : state === 'active' ? `${stage.label}: in progress` : `${stage.label}: waiting`}
                  />
                </span>
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className={cn('text-sm font-medium', state === 'pending' ? 'text-fg-subtle' : 'text-fg')}>
                  {stage.label}
                  {stage.key === 'fetching_commits' && commitCount ? (
                    <span className="font-normal text-fg-muted"> ({commitCount} commits)</span>
                  ) : null}
                </span>
                {state === 'active' && <span className="text-sm text-fg-muted">{stage.detail}</span>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
