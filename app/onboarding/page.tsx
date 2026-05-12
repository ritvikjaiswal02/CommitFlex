import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserRepos } from '@/lib/db/queries/repos'
import { getVoiceSettings } from '@/lib/db/queries/voice'
import { OnboardingStepper } from '@/components/onboarding-stepper'
import Link from 'next/link'

export default async function OnboardingPage() {
  const session = await auth()
  const isAuthenticated = !!session?.user?.id

  let voice: Awaited<ReturnType<typeof getVoiceSettings>> = null
  if (isAuthenticated) {
    const repos = await getUserRepos(session.user.id!)
    if (repos.length > 0) redirect('/dashboard')
    voice = await getVoiceSettings(session.user.id!)
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between px-margin py-md border-b border-white/8">
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
      <main className="flex-1 px-margin py-xl">
        <OnboardingStepper
          isAuthenticated={isAuthenticated}
          defaultTone={voice?.tone}
          defaultExtraContext={voice?.extraContext ?? ''}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-white/8 px-margin py-md flex items-center justify-between">
        <p className="font-mono text-code-sm text-on-surface-variant">
          Commit<span className="text-primary">Flex</span> · © 2026 CommitFlex. Built for the elite.
        </p>
        <div className="flex gap-lg">
          {['Privacy', 'Terms', 'Security', 'Status'].map(s => (
            <a key={s} href="#" className="font-mono text-code-sm text-on-surface-variant hover:text-primary transition-colors">
              {s}
            </a>
          ))}
        </div>
      </footer>
    </div>
  )
}
