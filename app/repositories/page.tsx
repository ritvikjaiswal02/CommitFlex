import type { Metadata } from 'next'
import { AppShell } from '@/components/app-shell'
import { ErrorState } from '@/components/ui/error-state'
import { PageHeader } from '@/components/ui/page-header'
import { getUserRepos } from '@/lib/db/queries/repos'
import { limitFor } from '@/lib/billing/catalog'
import { RepositoriesView } from '@/components/app/repositories-view'
import { loadPublishingContext, requireAppUser, settle } from '@/components/app/server-context'

export const metadata: Metadata = { title: 'Repositories' }
export const dynamic = 'force-dynamic'

export default async function RepositoriesPage({ searchParams }: { searchParams: { connect?: string } }) {
  const { user, timezone } = await requireAppUser('/repositories')
  const [repos, publishing] = await Promise.all([
    settle(getUserRepos(user.id), 'getUserRepos'),
    loadPublishingContext(user.id),
  ])
  const max = limitFor(publishing.plan?.id ?? 'free', 'repos')

  return (
    <AppShell user={user}>
      <PageHeader
        title="Repositories"
        description="The projects CommitFlex watches. Each one tells us when you merge a pull request or publish a release."
      />
      {repos.ok ? (
        <RepositoriesView
          // Only the fields the client needs: never send webhook secrets to the browser.
          repos={repos.value.map((r) => ({
            id: r.id,
            githubRepoId: String(r.githubRepoId),
            name: r.name,
            fullName: r.fullName,
            isPrivate: r.isPrivate,
            autoGenerate: r.autoGenerate,
            webhookId: r.webhookId ?? null,
            autopilotEnabled: r.autopilotEnabled,
            webhookEvents: r.webhookEvents,
            defaultBranch: r.defaultBranch,
          }))}
          limit={{ used: repos.value.length, max }}
          timezone={timezone}
          openConnect={searchParams.connect === '1'}
          planId={publishing.plan?.id ?? 'free'}
        />
      ) : (
        <div className="rounded-lg border border-line bg-surface px-5">
          <ErrorState
            title="Your repositories didn't load"
            description="We couldn't reach the database. Reload the page in a moment."
          />
        </div>
      )}
    </AppShell>
  )
}
