import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserRepos } from '@/lib/db/queries/repos'
import { getVoiceSettings } from '@/lib/db/queries/voice'
import { OnboardingStepper } from '@/components/onboarding-stepper'
import Link from 'next/link'

interface PageProps {
  searchParams?: { add?: string }
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const session = await auth()
  const isAuthenticated = !!session?.user?.id

  const addMode = searchParams?.add === '1'

  let voice: Awaited<ReturnType<typeof getVoiceSettings>> = null
  let existingGithubRepoIds: string[] = []
  if (isAuthenticated) {
    const repos = await getUserRepos(session.user.id!)
    // Initial onboarding only — once a user has repos, "Initialize" is done.
    // The "add more" flow (?add=1) lets them re-enter to connect more.
    if (repos.length > 0 && !addMode) redirect('/dashboard')
    voice = await getVoiceSettings(session.user.id!)
    existingGithubRepoIds = repos.map(r => String(r.githubRepoId))
  } else if (addMode) {
    // Can't add repos without an account — bounce to login.
    redirect('/login')
  }

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] cf-glow-primary pointer-events-none opacity-60" />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-margin py-md border-b border-white/8">
        <Link href="/" className="font-display text-base font-bold tracking-tighter text-on-surface">
          Commit<span className="text-primary">Flex</span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-primary ml-2 align-middle">BETA</span>
        </Link>
        <div className="flex items-center gap-2 font-mono text-code-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse-dot" />
          <span className="text-on-surface-variant uppercase tracking-widest">System Status: Operational</span>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 flex-1 px-margin py-xl">
        <OnboardingStepper
          isAuthenticated={isAuthenticated}
          defaultTone={voice?.tone}
          defaultExtraContext={voice?.extraContext ?? ''}
          addMode={addMode}
          existingGithubRepoIds={existingGithubRepoIds}
        />
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/8 px-margin py-md flex items-center justify-center">
        <p className="font-mono text-code-sm text-on-surface-variant">
          Commit<span className="text-primary">Flex</span> · © 2026 — built for devs who ship
        </p>
      </footer>
    </div>
  )
}
