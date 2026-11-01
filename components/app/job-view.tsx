'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CircleSlash, PenLine, RotateCw } from 'lucide-react'
import type { QueueItemView } from '@/types/autopilot'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { toast } from '@/components/ui/toast'
import { useUpgrade } from '@/components/billing/upgrade-provider'
import { PostCard, type PostCardVariant } from '@/components/post-card'
import { isTerminalJobStatus, useJobStream } from '@/lib/hooks/use-job-stream'
import { JobProgress } from '@/components/app/job-progress'
import { describeJobSource, jobBadge } from '@/components/app/job-meta'
import { triggerLabel } from '@/components/app/queue-meta'
import { dayKey, formatDay, formatWhen } from '@/components/app/format'

export interface JobViewJob {
  id: string
  status: string
  sourceType: string
  sourceRef: string | null
  trigger: string
  autoQueue: boolean
  windowStart: string
  windowEnd: string
  commitCount: number
  filteredCount: number
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

export interface JobViewDraft {
  id: string
  platform: 'linkedin' | 'twitter'
  sequenceNumber: number
  originalContent: string
  editedContent: string | null
  platformMetadata: { hashtags?: string[] } | null
  status: string
}

export interface JobViewProps {
  job: JobViewJob
  repo: { id: string; fullName: string } | null
  drafts: JobViewDraft[]
  queue: QueueItemView[]
  timezone: string
  linkedinDirect: boolean
  canUseVariants: boolean
  suggestions: string[]
}

interface JobApiResponse {
  job: Partial<JobViewJob> & { status: string }
  drafts: JobViewDraft[]
  queue?: QueueItemView[]
}

function toIso(value: unknown): string | null {
  if (!value) return null
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function variantsFor(drafts: JobViewDraft[], platform: 'linkedin' | 'twitter'): PostCardVariant[] {
  return drafts
    .filter((d) => d.platform === platform)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    .map((d) => ({
      id: d.id,
      sequenceNumber: d.sequenceNumber,
      content: d.editedContent ?? d.originalContent,
      hashtags: d.platformMetadata?.hashtags ?? [],
      status: d.status,
    }))
}

/** The run page: live progress while writing, then both posts side by side. */
export function JobView({
  job: initialJob,
  repo,
  drafts: initialDrafts,
  queue: initialQueue,
  timezone,
  linkedinDirect,
  canUseVariants,
  suggestions,
}: JobViewProps) {
  const router = useRouter()
  const { handlePlanError } = useUpgrade()
  const [job, setJob] = React.useState(initialJob)
  const [drafts, setDrafts] = React.useState(initialDrafts)
  const [queueByDraft, setQueueByDraft] = React.useState<Record<string, QueueItemView>>(() =>
    Object.fromEntries(initialQueue.map((q) => [q.draftId, q])),
  )
  const [refreshing, setRefreshing] = React.useState(false)
  const [rerunning, setRerunning] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
  const [range, setRange] = React.useState({
    start: dayKey(initialJob.windowStart, timezone),
    end: dayKey(initialJob.windowEnd, timezone),
  })

  const refresh = React.useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/jobs/${initialJob.id}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as JobApiResponse
      setJob((prev) => ({
        ...prev,
        status: data.job.status,
        commitCount: data.job.commitCount ?? prev.commitCount,
        filteredCount: data.job.filteredCount ?? prev.filteredCount,
        errorMessage: data.job.errorMessage ?? null,
        completedAt: toIso(data.job.completedAt) ?? prev.completedAt,
      }))
      setDrafts(data.drafts ?? [])
      if (data.queue) setQueueByDraft(Object.fromEntries(data.queue.map((q) => [q.draftId, q])))
    } finally {
      setRefreshing(false)
    }
  }, [initialJob.id])

  const { lostConnection } = useJobStream<JobViewDraft>({
    jobId: initialJob.id,
    initialStatus: initialJob.status,
    onUpdate: (update) => {
      setJob((prev) => ({ ...prev, status: update.status }))
      if (update.drafts.length > 0) setDrafts(update.drafts)
    },
    onDone: () => {
      void refresh()
      router.refresh()
    },
  })

  const running = !isTerminalJobStatus(job.status)
  const badge = jobBadge(job.status)
  const title = describeJobSource(job, (d) => formatDay(d, timezone))
  const linkedin = variantsFor(drafts, 'linkedin')
  const twitter = variantsFor(drafts, 'twitter')

  const rerun = async () => {
    if (!repo) return
    let body: Record<string, unknown>
    if (job.sourceType === 'pr' && job.sourceRef) body = { source: 'pr', repoId: repo.id, prUrl: job.sourceRef }
    else if (job.sourceType === 'release' && job.sourceRef) body = { source: 'release', repoId: repo.id, releaseTag: job.sourceRef }
    else {
      if (!range.start || !range.end || range.end <= range.start) {
        toast.error('Pick an end date after the start date')
        return
      }
      body = { repoId: repo.id, windowStart: range.start, windowEnd: range.end }
    }
    setRerunning(true)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 402 && (await handlePlanError(res))) return
      const data = (await res.json().catch(() => ({}))) as { jobId?: string; error?: unknown; code?: string }
      if (res.status === 409 && data.jobId) {
        router.push(`/jobs/${data.jobId}`)
        return
      }
      if (!res.ok || !data.jobId) {
        toast.error("The run didn't start", {
          description: typeof data.error === 'string' ? data.error : 'Try again in a moment.',
        })
        return
      }
      router.push(`/jobs/${data.jobId}`)
    } catch {
      toast.error("The run didn't start", { description: 'Check your connection and try again.' })
    } finally {
      setRerunning(false)
    }
  }

  const cancel = async () => {
    setCancelling(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        toast.error("Couldn't stop the run", { description: 'It may have just finished. Reload to check.' })
        return
      }
      setJob((prev) => ({ ...prev, status: 'cancelled' }))
      toast('Run stopped')
    } finally {
      setCancelling(false)
    }
  }

  const meta = (
    <>
      <Badge variant={badge.variant}>{badge.label}</Badge>
      {repo && <span className="font-mono text-xs text-fg-subtle">{repo.fullName}</span>}
      <span>{triggerLabel(job.trigger)}</span>
      <span>Started {formatWhen(job.createdAt, timezone)}</span>
    </>
  )

  if (running) {
    return (
      <>
        <PageHeader
          title="Writing your drafts"
          description={`${title}. This usually takes under a minute.`}
          breadcrumb={[{ label: 'Drafts', href: '/drafts' }, { label: 'Run' }]}
          meta={meta}
          actions={
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="ghost" loading={cancelling} />}>
                <CircleSlash strokeWidth={1.75} aria-hidden="true" />
                Stop run
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Stop this run?</AlertDialogTitle>
                  <AlertDialogDescription>
                    CommitFlex stops writing and no drafts are created. It still counts toward this month&rsquo;s drafts.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep writing</AlertDialogCancel>
                  <AlertDialogAction variant="danger" onClick={cancel}>
                    Stop run
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          }
        />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <section aria-label="Progress" className="rounded-lg border border-line bg-surface p-4 sm:p-6 lg:col-span-2">
            <JobProgress status={job.status} startedAt={job.createdAt} commitCount={job.commitCount} />
          </section>
          <aside className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-5">
            <h2 className="text-base font-semibold text-fg">While you wait</h2>
            <p className="text-sm text-fg-muted">
              You can leave this page. The drafts appear in Drafts when they&rsquo;re ready
              {job.autoQueue ? ' and go to your queue for review.' : '.'}
            </p>
            <p className="text-sm text-fg-muted">
              CommitFlex reads commit messages, pull request titles and release notes. It never reads your source code.
            </p>
            {lostConnection && (
              <Callout
                tone="warning"
                title="Live updates stopped"
                action={
                  <Button variant="secondary" size="sm" onClick={refresh} loading={refreshing}>
                    Check now
                  </Button>
                }
              >
                The connection dropped. The run keeps going on our side.
              </Callout>
            )}
          </aside>
        </div>
      </>
    )
  }

  const rerunPanel = repo && (
    <section aria-labelledby="rerun-title" className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 id="rerun-title" className="text-base font-semibold text-fg">
            {job.sourceType === 'window' ? 'Write again for a different window' : 'Write this one again'}
          </h2>
          <p className="mt-0.5 text-sm text-fg-muted">
            {job.sourceType === 'window'
              ? `Same repository, new dates. Counts as one draft run.`
              : 'A fresh pair of posts from the same source. Counts as one draft run.'}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {job.sourceType === 'window' && (
            <>
              <Field label="From" className="sm:w-40">
                <Input type="date" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
              </Field>
              <Field label="To" className="sm:w-40">
                <Input type="date" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
              </Field>
            </>
          )}
          <Button variant="secondary" onClick={rerun} loading={rerunning}>
            {!rerunning && <RotateCw strokeWidth={1.75} aria-hidden="true" />}
            Write again
          </Button>
        </div>
      </div>
    </section>
  )

  return (
    <>
      <PageHeader
        title={title}
        description={
          job.commitCount > 0
            ? `Written from ${job.filteredCount > 0 ? job.filteredCount : job.commitCount} meaningful ${job.commitCount === 1 ? 'commit' : 'commits'}.`
            : undefined
        }
        breadcrumb={[{ label: 'Drafts', href: '/drafts' }, { label: 'Run' }]}
        meta={meta}
        actions={
          <ButtonLink href="/queue" variant="secondary">
            Open queue
          </ButtonLink>
        }
      />

      <div className="flex flex-col gap-8">
        {job.status === 'failed' && (
          <div className="rounded-lg border border-line bg-surface px-5">
            <ErrorState
              title="This run didn't finish"
              description={job.errorMessage ?? "The writer didn't finish this run. Your commits are fine. Run it again, and if it fails twice, try a smaller window."}
              onRetry={repo ? rerun : undefined}
              retryLabel="Run it again"
            />
          </div>
        )}

        {job.status === 'cancelled' && (
          <Callout tone="info" title="This run was stopped">
            No drafts were written. Start it again below when you&rsquo;re ready.
          </Callout>
        )}

        {job.status === 'partial_completed' && (
          <Callout tone="warning" title="One platform didn't come back">
            The other post is below. Use Write again to try for both.
          </Callout>
        )}

        {(linkedin.length > 0 || twitter.length > 0) && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {linkedin.length > 0 && (
              <PostCard
                platform="linkedin"
                variants={linkedin}
                queueByDraft={queueByDraft}
                onQueueItem={(item) => setQueueByDraft((prev) => ({ ...prev, [item.draftId]: item }))}
                onCopied={refresh}
                onVariantsCreated={refresh}
                timezone={timezone}
                linkedinDirect={linkedinDirect}
                canUseVariants={canUseVariants}
                suggestions={suggestions}
              />
            )}
            {twitter.length > 0 && (
              <PostCard
                platform="twitter"
                variants={twitter}
                queueByDraft={queueByDraft}
                onQueueItem={(item) => setQueueByDraft((prev) => ({ ...prev, [item.draftId]: item }))}
                onCopied={refresh}
                onVariantsCreated={refresh}
                timezone={timezone}
                linkedinDirect={linkedinDirect}
                canUseVariants={canUseVariants}
                suggestions={suggestions}
              />
            )}
          </div>
        )}

        {job.status === 'completed' && linkedin.length === 0 && twitter.length === 0 && (
          <div className="rounded-lg border border-line bg-surface px-5">
            <EmptyState
              icon={PenLine}
              title="Nothing worth posting in this window"
              description="Every commit looked like maintenance (dependency bumps, formatting, CI). Try a wider window or a specific pull request."
              action={<ButtonLink href="/drafts/new">Draft from something else</ButtonLink>}
            />
          </div>
        )}

        {rerunPanel}
      </div>
    </>
  )
}
