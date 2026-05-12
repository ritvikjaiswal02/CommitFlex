import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { desc, eq, isNull, and } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/lib/db/client'
import { postDrafts, generationJobs, repos } from '@/lib/db/schema'
import { AppShell } from '@/components/app-sidebar'

const PLATFORM_LABEL: Record<string, string> = {
  twitter: 'TWITTER',
  linkedin: 'LINKEDIN',
}

export default async function DraftsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const drafts = await db.select({
      id: postDrafts.id,
      jobId: postDrafts.jobId,
      platform: postDrafts.platform,
      status: postDrafts.status,
      originalContent: postDrafts.originalContent,
      editedContent: postDrafts.editedContent,
      createdAt: postDrafts.createdAt,
      repoName: repos.fullName,
    })
    .from(postDrafts)
    .innerJoin(generationJobs, eq(generationJobs.id, postDrafts.jobId))
    .innerJoin(repos, eq(repos.id, generationJobs.repoId))
    .where(and(eq(postDrafts.userId, session.user.id), isNull(postDrafts.deletedAt)))
    .orderBy(desc(postDrafts.createdAt))
    .limit(50)

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email, image: session.user.image }}>
      <header className="mb-xl">
        <h1 className="font-display text-headline-md font-bold text-on-surface">Drafts</h1>
        <p className="text-on-surface-variant mt-1">
          Every post CommitFlex has generated for you.
        </p>
      </header>

      <div className="space-y-2">
        {drafts.length === 0 && (
          <div className="glass-card rounded-xl p-xl text-center">
            <p className="text-on-surface-variant">No drafts yet — start a generation from the dashboard.</p>
            <Link
              href="/dashboard"
              className="btn-primary-solid inline-flex items-center gap-2 mt-md h-10 px-4 rounded-xl text-sm"
            >
              Go to dashboard
            </Link>
          </div>
        )}

        {drafts.map(d => {
          const content = d.editedContent ?? d.originalContent
          const platformClass = d.platform === 'twitter' ? 'chip-primary' : 'chip-secondary'
          return (
            <Link
              key={d.id}
              href={`/jobs/${d.jobId}`}
              className="glass-card glass-card-hover rounded-xl p-md flex gap-md items-start group"
            >
              <span className={`chip ${platformClass} shrink-0`}>
                {PLATFORM_LABEL[d.platform] ?? d.platform}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-on-surface leading-relaxed line-clamp-2">{content}</p>
                <p className="font-mono text-code-sm text-on-surface-variant mt-1">
                  {d.repoName} · {new Date(d.createdAt).toLocaleDateString()} · {d.status}
                </p>
              </div>
              <span className="font-mono text-code-sm uppercase tracking-widest text-outline-variant opacity-0 group-hover:opacity-100 transition-opacity">
                Open →
              </span>
            </Link>
          )
        })}
      </div>
    </AppShell>
  )
}
