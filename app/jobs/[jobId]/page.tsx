import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { getJob } from '@/lib/db/queries/jobs'
import { getDraftsByJob } from '@/lib/db/queries/drafts'
import { getRepo } from '@/lib/db/queries/repos'
import { getAutopilotSettings, getQueueItemByDraft } from '@/lib/db/queries/autopilot'
import { planHasFeature } from '@/lib/billing/catalog'
import type { QueueItemView } from '@/types/autopilot'
import { JobView, type JobViewDraft, type JobViewJob } from '@/components/app/job-view'
import { computeNextSlots } from '@/components/app/slots'
import { iso, loadPublishingContext, requireAppUser, settle } from '@/components/app/server-context'

export const metadata: Metadata = { title: 'Run' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function JobPage({ params }: { params: { jobId: string } }) {
  const { user, timezone } = await requireAppUser(`/jobs/${params.jobId}`)
  if (!UUID.test(params.jobId)) notFound()

  const job = await getJob(params.jobId)
  if (!job || job.userId !== user.id) notFound()

  const [drafts, repo, publishing, settings] = await Promise.all([
    getDraftsByJob(job.id),
    getRepo(job.repoId),
    loadPublishingContext(user.id),
    settle(getAutopilotSettings(user.id), 'getAutopilotSettings'),
  ])

  const queueResults = await Promise.all(
    drafts.map((d) => settle(getQueueItemByDraft(user.id, d.id), 'getQueueItemByDraft')),
  )
  const queue = queueResults.flatMap((r) => (r.ok && r.value ? [r.value as QueueItemView] : []))

  const viewJob: JobViewJob = {
    id: job.id,
    status: job.status,
    sourceType: job.sourceType,
    sourceRef: job.sourceRef ?? null,
    trigger: job.trigger,
    autoQueue: job.autoQueue,
    windowStart: iso(job.windowStart) ?? new Date().toISOString(),
    windowEnd: iso(job.windowEnd) ?? new Date().toISOString(),
    commitCount: job.commitCount,
    filteredCount: job.filteredCount,
    errorMessage: job.errorMessage ?? null,
    createdAt: iso(job.createdAt) ?? new Date().toISOString(),
    completedAt: iso(job.completedAt),
  }

  const viewDrafts: JobViewDraft[] = drafts
    .filter((d) => d.deletedAt === null && (d.platform === 'linkedin' || d.platform === 'twitter'))
    .map((d) => ({
      id: d.id,
      platform: d.platform as 'linkedin' | 'twitter',
      sequenceNumber: d.sequenceNumber,
      originalContent: d.originalContent,
      editedContent: d.editedContent ?? null,
      platformMetadata: { hashtags: Array.isArray(d.platformMetadata?.hashtags) ? (d.platformMetadata.hashtags as string[]) : [] },
      status: d.status,
    }))

  const suggestions = settings.ok
    ? computeNextSlots({ ...settings.value, timezone }, new Date(), 5).map((d) => d.toISOString())
    : []

  return (
    <AppShell user={user}>
      <JobView
        job={viewJob}
        repo={repo && repo.userId === user.id ? { id: repo.id, fullName: repo.fullName } : null}
        drafts={viewDrafts}
        queue={queue}
        timezone={timezone}
        linkedinDirect={publishing.linkedinDirect}
        canUseVariants={planHasFeature(publishing.plan?.id ?? 'free', 'drafts.variants')}
        suggestions={suggestions}
      />
    </AppShell>
  )
}
