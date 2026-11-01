import type { Metadata } from 'next'
import Link from 'next/link'
import { FolderGit2 } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { PageHeader } from '@/components/ui/page-header'
import { StatusNode } from '@/components/ui/status-node'
import { Timeline, TimelineItem } from '@/components/ui/timeline'
import { GenerateForm } from '@/components/generate-form'
import { getUserRepos } from '@/lib/db/queries/repos'
import { getUserJobs } from '@/lib/db/queries/jobs'
import { listVoiceProfiles } from '@/lib/db/queries/voice'
import { describeJobSource, jobBadge } from '@/components/app/job-meta'
import { formatDay, formatWhen } from '@/components/app/format'
import { requireAppUser, settle, valueOr } from '@/components/app/server-context'

export const metadata: Metadata = { title: 'Draft a post' }
export const dynamic = 'force-dynamic'

export default async function NewDraftPage({
  searchParams,
}: {
  searchParams: { repo?: string; pr?: string; release?: string }
}) {
  const { user, timezone } = await requireAppUser('/drafts/new')
  const [repos, voices, jobs] = await Promise.all([
    settle(getUserRepos(user.id), 'getUserRepos'),
    settle(listVoiceProfiles(user.id), 'listVoiceProfiles'),
    settle(getUserJobs(user.id, 6), 'getUserJobs'),
  ])

  const repoList = valueOr(repos, [])
  const repoName = new Map(repoList.map((r) => [r.id, r.fullName]))
  const now = new Date()

  return (
    <AppShell user={user}>
      <PageHeader
        title="Draft a post"
        description="Pick what to write about. CommitFlex reads the commits and drafts a LinkedIn and an X post in your voice."
        breadcrumb={[{ label: 'Drafts', href: '/drafts' }, { label: 'New draft' }]}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <section aria-label="New draft" className="min-w-0 rounded-lg border border-line bg-surface p-4 sm:p-6 lg:col-span-2">
          {!repos.ok ? (
            <ErrorState
              title="Your repositories didn't load"
              description="We couldn't reach the database. Reload the page in a moment."
            />
          ) : repoList.length === 0 ? (
            <EmptyState
              icon={FolderGit2}
              title="Connect a repository first"
              description="CommitFlex writes from the commits in repositories you choose. It never reads your source code."
              action={<ButtonLink href="/repositories">Add a repository</ButtonLink>}
            />
          ) : (
            <GenerateForm
              repos={repoList.map((r) => ({ id: r.id, name: r.name, fullName: r.fullName }))}
              voiceProfiles={valueOr(voices, []).map((v) => ({ id: v.id, name: v.name, isDefault: v.isDefault }))}
              defaultRepoId={searchParams.repo ?? null}
              defaultPrUrl={searchParams.pr ?? ''}
              defaultReleaseTag={searchParams.release ?? ''}
            />
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="new-how" className="rounded-lg border border-line bg-surface p-4 sm:p-5">
            <h2 id="new-how" className="text-base font-semibold text-fg">
              What happens next
            </h2>
            <Timeline className="mt-4">
              <TimelineItem node={<StatusNode state="draft" size="md" />}>
                <p className="text-sm font-medium text-fg">Drafts in about a minute</p>
                <p className="text-sm text-fg-muted">You watch the progress, then edit both posts side by side.</p>
              </TimelineItem>
              <TimelineItem node={<StatusNode state="scheduled" size="md" />}>
                <p className="text-sm font-medium text-fg">Add to queue or schedule</p>
                <p className="text-sm text-fg-muted">Manual drafts never queue themselves. You pick the time.</p>
              </TimelineItem>
              <TimelineItem node={<StatusNode state="published" size="md" />}>
                <p className="text-sm font-medium text-fg">Publish</p>
                <p className="text-sm text-fg-muted">LinkedIn posts publish directly when connected. X opens pre-filled.</p>
              </TimelineItem>
            </Timeline>
          </section>

          <section aria-labelledby="new-recent" className="rounded-lg border border-line bg-surface">
            <h2 id="new-recent" className="px-4 pt-4 text-base font-semibold text-fg sm:px-5 sm:pt-5">
              Recent runs
            </h2>
            {!jobs.ok ? (
              <p className="px-4 pb-4 pt-2 text-sm text-fg-muted sm:px-5 sm:pb-5">Recent runs didn&rsquo;t load.</p>
            ) : jobs.value.length === 0 ? (
              <p className="px-4 pb-4 pt-2 text-sm text-fg-muted sm:px-5 sm:pb-5">Your runs show up here.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line border-t border-line">
                {jobs.value.map((job) => {
                  const badge = jobBadge(job.status)
                  return (
                    <li key={job.id}>
                      <Link
                        href={`/jobs/${job.id}`}
                        className="flex items-start justify-between gap-3 px-4 py-3 transition-colors duration-120 hover:bg-sunken/60 focus-ring-inset sm:px-5"
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-mono text-xs text-fg-subtle">{repoName.get(job.repoId) ?? 'Removed repository'}</span>
                          <span className="truncate text-sm text-fg">
                            {describeJobSource(job, (d) => formatDay(d, timezone, now))}
                          </span>
                          <span className="text-xs text-fg-subtle">{formatWhen(job.createdAt, timezone, now)}</span>
                        </span>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </AppShell>
  )
}
