import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUserRepos } from '@/lib/db/queries/repos'
import { AppShell } from '@/components/app-sidebar'
import { RepoManager } from '@/components/repo-manager'

export default async function RepositoriesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const repos = await getUserRepos(session.user.id)

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email, image: session.user.image }}>
      <header className="mb-xl flex flex-col md:flex-row md:items-end md:justify-between gap-md">
        <div>
          <h1 className="font-display text-headline-md font-bold text-on-surface">Repositories</h1>
          <p className="text-on-surface-variant mt-1">
            Connected repos whose commits power your generations.
          </p>
        </div>
        <Link
          href="/onboarding"
          className="btn-primary-solid h-10 px-4 rounded-xl text-sm inline-flex items-center gap-2"
        >
          + Connect repo
        </Link>
      </header>

      <div className="glass-card rounded-xl overflow-hidden p-lg">
        <RepoManager repos={repos} />
      </div>
    </AppShell>
  )
}
