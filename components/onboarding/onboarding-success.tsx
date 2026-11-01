'use client'

import * as React from 'react'
import Link from 'next/link'
import { Puzzle, RotateCcw } from 'lucide-react'
import { Button, ButtonLink } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import { PlatformIcon, platformLabel } from '@/components/brand/platform'
import { formatBillingDate } from '@/components/billing/format'
import type { QueueItemView } from '@/types/autopilot'
import { JobProgressStrip, useJobStream } from './job-progress'
import type { CompleteResponse } from './client'

export interface OnboardingSuccessProps {
  result: CompleteResponse
  showLinkedInConnect: boolean
  approvalMode: 'review' | 'auto'
  /** False while the Chrome Web Store listing doesn't exist yet. */
  extensionInStore?: boolean
}

type FirstResult =
  | { kind: 'loading' }
  | { kind: 'ready'; item: QueueItemView | null; errorMessage: string | null; drafts: number }
  | { kind: 'error' }

/** Loads the finished job and picks the first draft that needs review. */
function useFirstResult(jobId: string | null, done: boolean): FirstResult {
  const [state, setState] = React.useState<FirstResult>({ kind: 'loading' })
  React.useEffect(() => {
    setState({ kind: 'loading' })
    if (!jobId || !done) return
    let cancelled = false
    fetch(`/api/jobs/${jobId}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as {
          job?: { errorMessage?: string | null }
          drafts?: unknown[]
          queue?: QueueItemView[]
        }
        const queue = Array.isArray(data.queue) ? data.queue : []
        const item = queue.find((q) => q.status === 'pending_review') ?? queue[0] ?? null
        if (!cancelled) {
          setState({
            kind: 'ready',
            item,
            errorMessage: data.job?.errorMessage ?? null,
            drafts: Array.isArray(data.drafts) ? data.drafts.length : 0,
          })
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [jobId, done])
  return state
}

/**
 * The first-value moment. Stays on screen (no auto-redirect): while the
 * first run works it shows progress, and when it finishes it shows the first
 * draft itself with an Approve button, so the payoff happens here.
 */
export function OnboardingSuccess({
  result,
  showLinkedInConnect,
  approvalMode,
  extensionInStore = !!process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL,
}: OnboardingSuccessProps) {
  const [jobId, setJobId] = React.useState<string | null>(result.jobId)
  const job = useJobStream(jobId)
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const destination = result.redirectTo || '/dashboard'
  const first = useFirstResult(jobId, job.phase === 'completed' || job.phase === 'failed')
  const [approved, setApproved] = React.useState(false)
  const [approving, setApproving] = React.useState(false)
  const [retrying, setRetrying] = React.useState(false)

  React.useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const repo = result.repoFullName
  const trialEnd = formatBillingDate(result.trialEndsAt)
  const firstItem = first.kind === 'ready' ? first.item : null
  const completedEmpty = job.phase === 'completed' && first.kind === 'ready' && !firstItem && first.drafts === 0
  // A finished run whose job row says failed (provider error, dropped worker, cancel).
  const failed = job.phase === 'failed'

  let title: string
  if (!jobId) title = 'Autopilot is on.'
  else if (failed) title = 'Autopilot is on, but the first run didn’t finish.'
  else if (job.phase === 'completed' && (firstItem || (first.kind === 'ready' && first.drafts > 0))) title = 'Your first drafts are ready.'
  else if (completedEmpty) title = 'Autopilot is on.'
  else title = 'Your first drafts are being written.'

  let statusLine: React.ReactNode
  if (!jobId) {
    statusLine =
      result.jobError ??
      'Your first drafts will come from your next merged pull request, release or Monday digest.'
  } else if (failed) {
    statusLine = 'The writer didn’t respond. We’ll draft from your next merged pull request, or you can try again.'
  } else if (completedEmpty) {
    statusLine =
      first.kind === 'ready' && first.errorMessage
        ? first.errorMessage
        : 'Nothing in the last two weeks looked worth posting. Autopilot will draft from your next merged pull request or release.'
  } else if (job.phase === 'completed') {
    statusLine =
      approvalMode === 'auto'
        ? 'Here’s the first one. It’s already scheduled; edit or skip it from your queue.'
        : 'Here’s the first one. Approve it and it goes out at the time shown, or edit it first.'
  } else {
    statusLine = repo
      ? `Reading the last two weeks of ${repo}. This usually takes a few seconds; you can leave this page.`
      : 'Reading the last two weeks of commits. This usually takes a few seconds; you can leave this page.'
  }

  const approve = async () => {
    if (!firstItem) return
    setApproving(true)
    try {
      const res = await fetch(`/api/drafts/${firstItem.draftId}/approve`, { method: 'POST' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error('The draft wasn’t approved', { description: body.error ?? 'Try again from your queue.' })
        return
      }
      setApproved(true)
      toast.success('Approved', { description: 'It goes out at the time shown.' })
    } catch {
      toast.error('The draft wasn’t approved', { description: 'Check your connection and try again.' })
    } finally {
      setApproving(false)
    }
  }

  const retry = async () => {
    setRetrying(true)
    try {
      const res = await fetch('/api/autopilot/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string }
      if (!res.ok || !body.jobId) {
        toast.error('The run didn’t start', { description: body.error ?? 'Try again from Today in a minute.' })
        return
      }
      setApproved(false)
      setJobId(body.jobId)
    } catch {
      toast.error('The run didn’t start', { description: 'Check your connection and try again.' })
    } finally {
      setRetrying(false)
    }
  }

  const showProgress = !!jobId && job.phase !== 'completed'

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-fg-muted">Setup complete</p>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold text-fg outline-none sm:text-3xl">
          {title}
        </h1>
        <p className="max-w-prose text-base text-fg-muted" aria-live="polite">
          {statusLine}
        </p>
      </header>

      {showProgress && (
        <div className="rounded-lg border border-line bg-surface p-5">
          <JobProgressStrip status={job.status} phase={job.phase} />
          {failed && (
            <div className="mt-5 border-t border-line pt-4">
              <Button variant="secondary" onClick={retry} loading={retrying}>
                {!retrying && <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden="true" />}
                Try again
              </Button>
            </div>
          )}
        </div>
      )}

      {job.phase === 'completed' && first.kind === 'loading' && (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5" aria-busy="true" aria-label="Loading your first draft">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      )}

      {firstItem && (
        <section aria-label="Your first draft" className="flex flex-col gap-4">
          <div className="rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-fg">
                <PlatformIcon platform={firstItem.platform} className="size-4" />
                {platformLabel(firstItem.platform)}
              </span>
              {firstItem.sourceTitle && <span className="truncate text-sm text-fg-muted">{firstItem.sourceTitle}</span>}
            </div>
            <p className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words px-5 py-4 text-sm leading-6 text-fg">
              {firstItem.content}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {firstItem.status === 'pending_review' && !approved ? (
              <Button size="lg" onClick={approve} loading={approving}>
                Approve
              </Button>
            ) : (
              <p className="text-sm font-medium text-success" role="status">
                {approved || firstItem.status !== 'pending_review' ? 'Approved and scheduled.' : null}
              </p>
            )}
            <ButtonLink href={`/queue?draft=${firstItem.draftId}`} variant="secondary" size="lg">
              Edit in queue
            </ButtonLink>
            <ButtonLink href={destination} variant="ghost" size="lg">
              Open Today
            </ButtonLink>
          </div>
        </section>
      )}

      {result.voiceWarning && (
        <Callout tone="warning" title="Your sample posts weren’t analysed">
          {result.voiceWarning}
        </Callout>
      )}

      {!firstItem && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <ButtonLink href={destination} size="lg">
            Open Today
          </ButtonLink>
          {showLinkedInConnect && (
            <ButtonLink
              href="/api/integrations/linkedin/connect?returnTo=/dashboard"
              prefetch={false}
              variant="secondary"
              size="lg"
            >
              <PlatformIcon platform="linkedin" className="size-4" />
              Connect LinkedIn
            </ButtonLink>
          )}
        </div>
      )}

      <dl className="grid gap-4 border-t border-line pt-6 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-fg-muted">Approvals</dt>
          <dd className="text-fg">
            {approvalMode === 'auto' && !result.downgraded?.includes('approvalMode')
              ? 'Drafts are scheduled automatically. You get a summary with a Skip link for each.'
              : 'Each draft arrives by email with an Approve button.'}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-fg-muted">Ship moments</dt>
          <dd className="text-fg">Merged pull requests and releases are drafted as they happen.</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-fg-muted">Trial</dt>
          <dd className="text-fg">
            {trialEnd ? `Pro is included until ${trialEnd}. No card needed.` : 'Change anything later in Settings.'}
          </dd>
        </div>
      </dl>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-muted">
        {firstItem && showLinkedInConnect && (
          <Link
            href="/api/integrations/linkedin/connect?returnTo=/dashboard"
            prefetch={false}
            className="inline-flex items-center gap-1.5 rounded-sm underline underline-offset-2 hover:text-fg focus-ring"
          >
            <PlatformIcon platform="linkedin" className="size-3.5" />
            Connect LinkedIn to publish directly
          </Link>
        )}
        <Link href="/extension" className="inline-flex items-center gap-1.5 rounded-sm underline underline-offset-2 hover:text-fg focus-ring">
          <Puzzle className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          {extensionInStore ? 'Install the Chrome extension' : 'Chrome extension (early access)'}
        </Link>
      </p>
    </div>
  )
}
