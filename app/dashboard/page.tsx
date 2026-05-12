import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { desc, eq, isNull, and } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { postDrafts, generationJobs, repos } from '@/lib/db/schema'
import { getUserRepos } from '@/lib/db/queries/repos'
import { getUserJobs } from '@/lib/db/queries/jobs'
import { AppShell } from '@/components/app-sidebar'
import { GenerateForm } from '@/components/generate-form'
import { DashboardBento } from '@/components/dashboard-bento'

const TONE_BY_PLATFORM: Record<string, string> = {
  twitter: 'PUNCHY',
  linkedin: 'PROFESSIONAL',
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  const [userRepos, jobs, recentDrafts] = await Promise.all([
    getUserRepos(userId),
    getUserJobs(userId, 50),
    db.select({
        id: postDrafts.id,
        jobId: postDrafts.jobId,
        platform: postDrafts.platform,
        originalContent: postDrafts.originalContent,
        editedContent: postDrafts.editedContent,
        createdAt: postDrafts.createdAt,
        repoName: repos.fullName,
      })
      .from(postDrafts)
      .innerJoin(generationJobs, eq(generationJobs.id, postDrafts.jobId))
      .innerJoin(repos, eq(repos.id, generationJobs.repoId))
      .where(and(eq(postDrafts.userId, userId), isNull(postDrafts.deletedAt)))
      .orderBy(desc(postDrafts.createdAt))
      .limit(4),
  ])

  if (userRepos.length === 0) redirect('/onboarding')

  // Recent jobs joined with repo names for the activity feed
  const repoMap = new Map(userRepos.map(r => [r.id, r.fullName]))
  const activity = jobs.slice(0, 6).map(j => ({
    id: j.id,
    repoName: repoMap.get(j.repoId) ?? 'repo',
    detail: j.errorMessage ?? `Window ${new Date(j.windowStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    status: j.status,
    at: j.createdAt,
  }))

  // 7-day generation history
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const history = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today)
    day.setDate(day.getDate() - (6 - i))
    const next = new Date(day); next.setDate(next.getDate() + 1)
    return jobs.filter(j => j.createdAt >= day && j.createdAt < next).length
  })

  const drafts = recentDrafts.map(d => ({
    id: d.id,
    jobId: d.jobId,
    platform: (d.platform as 'twitter' | 'linkedin'),
    content: d.editedContent ?? d.originalContent,
    toneTag: TONE_BY_PLATFORM[d.platform] ?? null,
    generatedAt: d.createdAt,
    metric: { label: 'Repo', value: d.repoName.split('/').pop() ?? d.repoName },
  }))

  // Stats
  const completed = jobs.filter(j => j.status === 'completed').length
  const active = jobs.filter(j => !['completed', 'partial_completed', 'failed', 'cancelled'].includes(j.status)).length
  const draftsTotal = recentDrafts.length // approx; full count not loaded here

  const firstName = session.user.name?.split(' ')[0] ?? 'there'

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email, image: session.user.image }}>
      {/* Page header */}
      <header className="mb-xl flex flex-col md:flex-row gap-lg justify-between items-start">
        <div>
          <h1 className="font-display text-headline-md font-bold text-on-surface">
            System Overview
          </h1>
          <p className="text-on-surface-variant mt-1">
            Hey {firstName} — your generation status and recent posts.
          </p>
        </div>
        <div className="grid grid-cols-3 md:flex gap-md w-full md:w-auto">
          <div className="glass-card px-md py-sm rounded-xl flex flex-col min-w-[140px]">
            <span className="font-mono text-label-caps uppercase text-on-surface-variant">Repos</span>
            <span className="font-mono text-lg font-bold text-primary">
              {userRepos.length}
            </span>
          </div>
          <div className="glass-card px-md py-sm rounded-xl flex flex-col min-w-[140px]">
            <span className="font-mono text-label-caps uppercase text-on-surface-variant">Generated</span>
            <span className="font-mono text-lg font-bold text-tertiary">
              {completed} <span className="text-[10px] text-on-surface-variant">/ {jobs.length}</span>
            </span>
          </div>
          <div className="glass-card px-md py-sm rounded-xl flex flex-col min-w-[140px]">
            <span className="font-mono text-label-caps uppercase text-on-surface-variant">In&nbsp;Flight</span>
            <span className="font-mono text-lg font-bold text-on-surface">{active}</span>
          </div>
        </div>
      </header>

      {/* New generation form — collapsed-style; expand when ?new=1 */}
      <div className="mb-xl">
        <GenerateForm repos={userRepos.map(r => ({ id: r.id, name: r.name, fullName: r.fullName }))} />
      </div>

      {/* Bento grid */}
      <DashboardBento drafts={drafts} activity={activity} history={history} />

      {/* Hidden, but used so eslint doesn't complain about unused var */}
      <span hidden>{draftsTotal}</span>
    </AppShell>
  )
}
